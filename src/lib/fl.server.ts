/**
 * Server-only implementation behind the federated-learning server functions.
 * Everything that touches the service-role client, raw hospital samples or the
 * ledger lives here. Never import this from a component or a route module.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { FEATURE_NAMES, N_FEATURES, SHARD_COUNT } from "@/lib/ml/feature-names";
import {
  DEFAULT_CONFIG,
  evaluate,
  hashSeed,
  linearShap,
  rng,
  runFederated,
  score,
  sha256Hex,
  sigmoid,
  standardise,
  type ClientPartition,
  type TrainConfig,
} from "@/lib/ml/fedlearn.server";
import type {
  JsonValue,
  DatasetDto,
  LedgerDto,
  PredictionResult,
  SystemStatusDto,
  TrainingResultDto,
} from "@/lib/fl-types";

type Json = Record<string, unknown>;

export type Actor = {
  userId: string;
  label: string;
  isAdmin: boolean;
  hospital: { id: string; name: string; status: string } | null;
};

/**
 * Resolve who is calling, using the caller's own RLS-scoped client so a user
 * can never claim a role or a hospital that is not theirs.
 */
export async function resolveActor(
  client: SupabaseClient<Database>,
  userId: string,
  email?: string | null,
): Promise<Actor> {
  const [{ data: isAdmin, error: roleErr }, { data: hospital }] = await Promise.all([
    client.rpc("has_role", { _user_id: userId, _role: "admin" }),
    client.from("hospitals").select("id,name,status").eq("owner_id", userId).maybeSingle(),
  ]);
  if (roleErr) throw new Error(`Could not verify your role: ${roleErr.message}`);
  return {
    userId,
    label: hospital?.name ?? email ?? userId,
    isAdmin: Boolean(isAdmin),
    hospital: hospital ?? null,
  };
}

export function requireApprovedHospital(actor: Actor) {
  if (!actor.hospital) {
    throw new Error("Your account is not linked to a hospital.");
  }
  if (actor.hospital.status !== "approved") {
    throw new Error("Your hospital is awaiting administrator approval.");
  }
  return actor.hospital;
}

export function requireAdmin(actor: Actor) {
  if (!actor.isAdmin) throw new Error("Administrator access is required for this action.");
}

/* ------------------------------------------------------------------ audit */

export async function recordAudit(entry: {
  eventType: string;
  actorId?: string | null;
  actorLabel?: string | null;
  hospitalId?: string | null;
  modelVersion?: string | null;
  roundNumber?: number | null;
  payload?: Json;
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("audit_events")
    .insert({
      event_type: entry.eventType,
      actor_id: entry.actorId ?? null,
      actor_label: entry.actorLabel ?? null,
      hospital_id: entry.hospitalId ?? null,
      model_version: entry.modelVersion ?? null,
      round_number: entry.roundNumber ?? null,
      payload: (entry.payload ?? {}) as never,
      // Overwritten by the database chaining trigger.
      previous_hash: "",
      hash: "",
    })
    .select("hash")
    .single();

  if (error) {
    console.error("[audit] failed to append ledger record", error);
    return null;
  }
  return data?.hash ?? null;
}

export async function notify(userId: string, title: string, body: string, level = "info") {
  const { error } = await supabaseAdmin
    .from("notifications")
    .insert({ user_id: userId, title, body, level });
  if (error) console.error("[notify] failed", error);
}

/* ------------------------------------------------------------- datasets */

function shardFor(index: number) {
  // Deterministic seeded shuffle so every shard is a stable, reproducible slice.
  return index % SHARD_COUNT;
}

export async function importPublicShard(hospitalId: string, actorId: string, actorLabel: string) {
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("datasets")
    .select("id")
    .eq("hospital_id", hospitalId);
  if (exErr) throw new Error(`Could not read existing datasets: ${exErr.message}`);
  if (existing && existing.length > 0) {
    throw new Error("This hospital already holds a dataset. Remove it before importing again.");
  }

  const { count: datasetCount } = await supabaseAdmin
    .from("datasets")
    .select("id", { count: "exact", head: true });

  const shard = shardFor(datasetCount ?? 0);

  const { WDBC_SAMPLES } = await import("@/lib/ml/dataset.server");
  const order = WDBC_SAMPLES.map((_, i) => i);
  const next = rng(hashSeed("medfed-wdbc-partition-v1"));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const a = order[i] as number;
    order[i] = order[j] as number;
    order[j] = a;
  }

  const mine = order.filter((_, position) => position % SHARD_COUNT === shard);
  const testCut = Math.max(1, Math.floor(mine.length * 0.2));

  const rows = mine.map((sampleIndex, position) => {
    const s = WDBC_SAMPLES[sampleIndex]!;
    return {
      external_ref: s.ref,
      features: s.features,
      label: s.label,
      split: position < testCut ? "test" : "train",
    };
  });

  const { data: ds, error: dsErr } = await supabaseAdmin
    .from("datasets")
    .insert({
      hospital_id: hospitalId,
      name: `WDBC clinical shard ${shard + 1}/${SHARD_COUNT}`,
      source: `uci_wdbc_shard_${shard}`,
      feature_names: FEATURE_NAMES as never,
      sample_count: rows.length,
    })
    .select("id")
    .single();
  if (dsErr || !ds) throw new Error(`Could not create the dataset: ${dsErr?.message}`);

  const { error: sampleErr } = await supabaseAdmin.from("dataset_samples").insert(
    rows.map((r) => ({ ...r, dataset_id: ds.id, hospital_id: hospitalId })),
  );
  if (sampleErr) {
    await supabaseAdmin.from("datasets").delete().eq("id", ds.id);
    throw new Error(`Could not store the samples: ${sampleErr.message}`);
  }

  await recordAudit({
    eventType: "dataset.imported",
    actorId,
    actorLabel,
    hospitalId,
    payload: {
      dataset_id: ds.id,
      source: `uci_wdbc_shard_${shard}`,
      samples: rows.length,
      train: rows.length - testCut,
      test: testCut,
    },
  });

  return { datasetId: ds.id, samples: rows.length, train: rows.length - testCut, test: testCut };
}

export function parseCsv(csv: string): { features: number[]; label: number }[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("The file needs a header row and at least one data row.");

  const header = (lines[0] as string).split(",").map((h) => h.trim().toLowerCase());
  const labelIdx = header.findIndex((h) => ["label", "diagnosis", "target", "outcome"].includes(h));
  if (labelIdx === -1) {
    throw new Error("No outcome column found. Add a column named label, diagnosis, target or outcome.");
  }
  const featureIdx = header.map((_, i) => i).filter((i) => i !== labelIdx);
  if (featureIdx.length !== N_FEATURES) {
    throw new Error(
      `Expected ${N_FEATURES} feature columns plus one outcome column, found ${featureIdx.length} feature columns.`,
    );
  }

  const rows: { features: number[]; label: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = (lines[i] as string).split(",").map((c) => c.trim());
    if (cells.length !== header.length) {
      throw new Error(`Row ${i + 1} has ${cells.length} columns, expected ${header.length}.`);
    }
    const rawLabel = (cells[labelIdx] ?? "").toLowerCase();
    let label: number;
    if (["1", "m", "malignant", "positive", "true", "yes"].includes(rawLabel)) label = 1;
    else if (["0", "b", "benign", "negative", "false", "no"].includes(rawLabel)) label = 0;
    else throw new Error(`Row ${i + 1}: outcome "${cells[labelIdx]}" is not a recognised value.`);

    const features = featureIdx.map((idx) => {
      const v = Number(cells[idx]);
      if (!Number.isFinite(v)) {
        throw new Error(`Row ${i + 1}: "${cells[idx]}" in column "${header[idx]}" is not a number.`);
      }
      return v;
    });
    rows.push({ features, label });
  }

  if (!rows.some((r) => r.label === 1) || !rows.some((r) => r.label === 0)) {
    throw new Error("The dataset must contain both positive and negative outcomes.");
  }
  return rows;
}

export async function importCsv(
  hospitalId: string,
  actorId: string,
  actorLabel: string,
  fileName: string,
  csv: string,
) {
  const rows = parseCsv(csv);
  const { data: existing } = await supabaseAdmin
    .from("datasets")
    .select("id")
    .eq("hospital_id", hospitalId);
  if (existing && existing.length > 0) {
    throw new Error("This hospital already holds a dataset. Remove it before importing again.");
  }

  const testCut = Math.max(1, Math.floor(rows.length * 0.2));
  const { data: ds, error: dsErr } = await supabaseAdmin
    .from("datasets")
    .insert({
      hospital_id: hospitalId,
      name: fileName.slice(0, 120) || "Uploaded dataset",
      source: "csv_upload",
      feature_names: FEATURE_NAMES as never,
      sample_count: rows.length,
    })
    .select("id")
    .single();
  if (dsErr || !ds) throw new Error(`Could not create the dataset: ${dsErr?.message}`);

  const { error: sampleErr } = await supabaseAdmin.from("dataset_samples").insert(
    rows.map((r, i) => ({
      dataset_id: ds.id,
      hospital_id: hospitalId,
      features: r.features,
      label: r.label,
      split: i < testCut ? "test" : "train",
    })),
  );
  if (sampleErr) {
    await supabaseAdmin.from("datasets").delete().eq("id", ds.id);
    throw new Error(`Could not store the samples: ${sampleErr.message}`);
  }

  await recordAudit({
    eventType: "dataset.imported",
    actorId,
    actorLabel,
    hospitalId,
    payload: { dataset_id: ds.id, source: "csv_upload", samples: rows.length },
  });

  return { datasetId: ds.id, samples: rows.length, train: rows.length - testCut, test: testCut };
}

export async function removeDataset(
  datasetId: string,
  hospitalId: string,
  actorId: string,
  actorLabel: string,
) {
  const { data: ds } = await supabaseAdmin
    .from("datasets")
    .select("id,hospital_id")
    .eq("id", datasetId)
    .maybeSingle();
  if (!ds) throw new Error("Dataset not found.");
  if (ds.hospital_id !== hospitalId) throw new Error("You can only remove your own dataset.");

  const { error } = await supabaseAdmin.from("datasets").delete().eq("id", datasetId);
  if (error) throw new Error(`Could not remove the dataset: ${error.message}`);

  await recordAudit({
    eventType: "dataset.removed",
    actorId,
    actorLabel,
    hospitalId,
    payload: { dataset_id: datasetId },
  });
  return { ok: true };
}

export async function listDatasets(scope: { hospitalId?: string }): Promise<DatasetDto[]> {
  let query = supabaseAdmin
    .from("datasets")
    .select("id,name,source,sample_count,created_at,hospital_id,hospitals(name)")
    .order("created_at", { ascending: false });
  if (scope.hospitalId) query = query.eq("hospital_id", scope.hospitalId);

  const { data, error } = await query;
  if (error) throw new Error(`Could not list datasets: ${error.message}`);

  const result: DatasetDto[] = [];
  for (const d of data ?? []) {
    const { data: samples } = await supabaseAdmin
      .from("dataset_samples")
      .select("label,split")
      .eq("dataset_id", d.id);
    const rows = samples ?? [];
    result.push({
      id: d.id,
      name: d.name,
      source: d.source,
      sampleCount: d.sample_count,
      trainCount: rows.filter((r) => r.split === "train").length,
      testCount: rows.filter((r) => r.split === "test").length,
      positives: rows.filter((r) => r.label === 1).length,
      createdAt: d.created_at,
      hospitalName: (d as { hospitals?: { name?: string } }).hospitals?.name ?? null,
    });
  }
  return result;
}

/* ------------------------------------------------------------- training */

async function loadPartitions(): Promise<ClientPartition[]> {
  const { data: hospitals, error } = await supabaseAdmin
    .from("hospitals")
    .select("id,name")
    .eq("status", "approved");
  if (error) throw new Error(`Could not load hospitals: ${error.message}`);

  const partitions: ClientPartition[] = [];
  for (const h of hospitals ?? []) {
    const { data: samples, error: sErr } = await supabaseAdmin
      .from("dataset_samples")
      .select("features,label,split")
      .eq("hospital_id", h.id);
    if (sErr) throw new Error(`Could not load samples for ${h.name}: ${sErr.message}`);
    if (!samples?.length) continue;

    const train = samples.filter((s) => s.split === "train");
    const test = samples.filter((s) => s.split === "test");
    partitions.push({
      hospitalId: h.id,
      hospitalName: h.name,
      train: { x: train.map((s) => s.features), y: train.map((s) => s.label) },
      test: { x: test.map((s) => s.features), y: test.map((s) => s.label) },
    });
  }
  return partitions;
}

export async function trainGlobal(
  actorId: string,
  actorLabel: string,
  options: { rounds: number; localEpochs: number; noiseMultiplier: number },
): Promise<TrainingResultDto> {
  const partitions = await loadPartitions();
  if (partitions.length === 0) {
    throw new Error(
      "No approved hospital holds a dataset yet. Import a dataset from the Datasets page before training.",
    );
  }

  const cfg: TrainConfig = {
    ...DEFAULT_CONFIG,
    rounds: Math.min(Math.max(Math.round(options.rounds), 1), 100),
    localEpochs: Math.min(Math.max(Math.round(options.localEpochs), 1), 50),
    noiseMultiplier: Math.min(Math.max(options.noiseMultiplier, 0), 2),
  };

  const runId = crypto.randomUUID();
  await recordAudit({
    eventType: "training.started",
    actorId,
    actorLabel,
    payload: {
      run_id: runId,
      rounds: cfg.rounds,
      local_epochs: cfg.localEpochs,
      hospitals: partitions.length,
      dp_noise_multiplier: cfg.noiseMultiplier,
      dp_clip_norm: cfg.clipNorm,
      secure_aggregation: true,
    },
  });

  const result = await runFederated(partitions, N_FEATURES, cfg, runId);
  const version = `v${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;

  const { data: model, error: modelErr } = await supabaseAdmin
    .from("global_models")
    .insert({
      version,
      feature_names: FEATURE_NAMES as never,
      weights: result.weights,
      bias: result.bias,
      feature_means: result.stats.means,
      feature_stds: result.stats.stds,
      rounds_completed: result.rounds.length,
      participating_hospitals: partitions.length,
      training_samples: result.trainSamples,
      test_samples: result.testSamples,
      dp_noise_multiplier: cfg.noiseMultiplier,
      dp_clip_norm: cfg.clipNorm,
      secure_aggregation: true,
      metrics: result.finalMetrics as never,
      history: result.rounds.map((r) => ({
        round: r.round,
        global_accuracy: r.globalAccuracy,
        metrics: r.metrics,
        locals: r.locals,
      })) as never,
      is_active: true,
    })
    .select("id")
    .single();
  if (modelErr || !model) throw new Error(`Could not save the trained model: ${modelErr?.message}`);

  await supabaseAdmin.from("global_models").update({ is_active: false }).neq("id", model.id);

  for (let i = 0; i < result.rounds.length; i++) {
    const r = result.rounds[i]!;
    const { data: roundRow, error: roundErr } = await supabaseAdmin
      .from("training_rounds")
      .insert({
        model_id: model.id,
        run_id: runId,
        round_number: r.round,
        global_accuracy: r.globalAccuracy,
        metrics: r.metrics as never,
        participating_hospitals: r.locals.length,
        weights_hash: r.weightsHash,
      })
      .select("id")
      .single();
    if (roundErr || !roundRow) throw new Error(`Could not save round ${r.round}: ${roundErr?.message}`);

    const locals = result.localsByRound[i] ?? [];
    if (locals.length) {
      await supabaseAdmin.from("local_updates").insert(
        locals.map((l) => ({
          round_id: roundRow.id,
          hospital_id: l.hospitalId,
          sample_count: l.sampleCount,
          local_accuracy: l.localAccuracy,
          local_loss: l.localLoss,
          update_hash: l.updateHash,
          masked: true,
        })),
      );
    }

    await recordAudit({
      eventType: "training.round",
      actorId,
      actorLabel,
      modelVersion: version,
      roundNumber: r.round,
      payload: {
        run_id: runId,
        weights_hash: r.weightsHash,
        global_accuracy: Number(r.globalAccuracy.toFixed(4)),
        participants: locals.map((l) => ({
          hospital: l.hospitalName,
          samples: l.sampleCount,
          update_hash: l.updateHash,
        })),
      },
    });
  }

  const ledgerHash =
    (await recordAudit({
      eventType: "model.version_created",
      actorId,
      actorLabel,
      modelVersion: version,
      payload: {
        run_id: runId,
        model_id: model.id,
        rounds: result.rounds.length,
        metrics: result.finalMetrics,
        training_samples: result.trainSamples,
        test_samples: result.testSamples,
        hospitals: partitions.length,
      },
    })) ?? "";

  const { data: owners } = await supabaseAdmin
    .from("hospitals")
    .select("owner_id")
    .eq("status", "approved");
  for (const o of owners ?? []) {
    await notify(
      o.owner_id,
      `Global model ${version} published`,
      `A federated run over ${partitions.length} hospital(s) finished with ${result.finalMetrics.accuracy.toFixed(2)}% accuracy.`,
    );
  }

  return {
    modelId: model.id,
    version,
    rounds: result.rounds.map((r) => ({
      round: r.round,
      globalAccuracy: r.globalAccuracy,
      metrics: r.metrics as unknown as Record<string, number>,
      locals: r.locals,
      weightsHash: r.weightsHash,
    })),
    finalMetrics: result.finalMetrics as unknown as Record<string, number>,
    participatingHospitals: partitions.length,
    trainSamples: result.trainSamples,
    testSamples: result.testSamples,
    ledgerHash,
  };
}

/* ------------------------------------------------------------ prediction */

async function activeModel() {
  const { data, error } = await supabaseAdmin
    .from("global_models")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load the global model: ${error.message}`);
  return data;
}

export async function getFeatureSchema() {
  const model = await activeModel();
  return {
    trained: Boolean(model),
    version: model?.version ?? null,
    featureNames: (model?.feature_names as string[] | null) ?? FEATURE_NAMES,
  };
}

export async function predict(
  actorId: string,
  actorLabel: string,
  hospitalId: string | null,
  patientId: string | null,
  features: number[],
): Promise<PredictionResult> {
  const model = await activeModel();
  if (!model) {
    throw new Error(
      "No global model has been trained yet. An administrator must run a federated training round first.",
    );
  }

  const names = (model.feature_names as string[] | null) ?? FEATURE_NAMES;
  if (features.length !== names.length) {
    throw new Error(`Expected ${names.length} feature values, received ${features.length}.`);
  }
  if (features.some((v) => !Number.isFinite(v))) {
    throw new Error("All feature values must be finite numbers.");
  }

  const standardised = standardise([features], {
    means: model.feature_means,
    stds: model.feature_stds,
    count: model.training_samples,
  })[0] as number[];

  const z = score(model.weights, model.bias, standardised);
  const probability = sigmoid(z);
  const predictedLabel = probability >= 0.5 ? 1 : 0;
  const confidence = Math.max(probability, 1 - probability);
  const riskPercentage = probability * 100;
  const riskLevel = riskPercentage >= 70 ? "High" : riskPercentage >= 40 ? "Moderate" : "Low";
  const recommendedAction =
    riskLevel === "High"
      ? "Escalate for specialist review and confirmatory diagnostics."
      : riskLevel === "Moderate"
        ? "Schedule follow-up imaging and repeat assessment."
        : "Routine monitoring; no immediate escalation indicated.";

  const shap = linearShap(features, model.weights, model.feature_means, model.feature_stds, names);
  const explanationAvailable = shap.some((s) => Math.abs(s.impact) > 1e-9);

  const { data: row, error } = await supabaseAdmin
    .from("predictions")
    .insert({
      hospital_id: hospitalId,
      patient_id: patientId,
      created_by: actorId,
      model_version: model.version,
      probability,
      confidence,
      predicted_label: predictedLabel,
      risk_percentage: riskPercentage,
      risk_level: riskLevel,
      recommended_action: recommendedAction,
      input_features: Object.fromEntries(names.map((n, i) => [n, features[i]])) as never,
      shap_explanation: shap as never,
      explanation_available: explanationAvailable,
      status: "completed",
    })
    .select("id")
    .single();
  if (error || !row) throw new Error(`Prediction succeeded but could not be stored: ${error?.message}`);

  await recordAudit({
    eventType: "prediction.created",
    actorId,
    actorLabel,
    hospitalId,
    modelVersion: model.version,
    payload: {
      prediction_id: row.id,
      risk_level: riskLevel,
      probability: Number(probability.toFixed(6)),
      // Hash of the inputs only - no clinical values are written to the ledger.
      input_digest: await sha256Hex(features.map((f) => f.toFixed(6)).join(",")),
      explanation_available: explanationAvailable,
    },
  });

  return {
    predictionId: row.id,
    modelVersion: model.version,
    probability,
    riskPercentage,
    riskLevel,
    confidence,
    predictedLabel,
    recommendedAction,
    explanationAvailable,
    shap,
    baseline: sigmoid(model.bias) * 100,
  };
}

/* ---------------------------------------------------------------- ledger */

export async function readLedger(limit = 200): Promise<LedgerDto> {
  const { data: verification, error: vErr } = await supabaseAdmin.rpc("verify_audit_chain");
  if (vErr) throw new Error(`Could not verify the ledger: ${vErr.message}`);
  const v = Array.isArray(verification) ? verification[0] : verification;

  const { data, error } = await supabaseAdmin
    .from("audit_events")
    .select("*")
    .order("seq", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not read the ledger: ${error.message}`);

  return {
    valid: Boolean(v?.valid),
    total: Number(v?.total ?? 0),
    firstBrokenSeq: v?.first_broken_seq ?? null,
    blocks: (data ?? []).map((b) => ({
      seq: Number(b.seq),
      eventType: b.event_type,
      actor: b.actor_label,
      modelVersion: b.model_version,
      roundNumber: b.round_number,
      payload: (b.payload ?? {}) as Record<string, JsonValue>,
      previousHash: b.previous_hash,
      hash: b.hash,
      createdAt: b.created_at,
    })),
  };
}

/* ---------------------------------------------------------------- status */

export async function systemStatus(): Promise<SystemStatusDto> {
  let dbOk = true;
  let dbMessage = "Connected";
  let hospitalsTotal = 0;
  let hospitalsApproved = 0;

  const { count: total, error: hErr } = await supabaseAdmin
    .from("hospitals")
    .select("id", { count: "exact", head: true });
  if (hErr) {
    dbOk = false;
    dbMessage = hErr.message;
  } else {
    hospitalsTotal = total ?? 0;
    const { count: approved } = await supabaseAdmin
      .from("hospitals")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved");
    hospitalsApproved = approved ?? 0;
  }

  const model = await activeModel();

  const { data: datasetRows } = await supabaseAdmin
    .from("datasets")
    .select("hospital_id,sample_count");
  const hospitalsWithData = new Set((datasetRows ?? []).map((d) => d.hospital_id)).size;
  const totalTrainingSamples = (datasetRows ?? []).reduce((a, d) => a + d.sample_count, 0);

  const { data: lastRound } = await supabaseAdmin
    .from("training_rounds")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: verification } = await supabaseAdmin.rpc("verify_audit_chain");
  const v = Array.isArray(verification) ? verification[0] : verification;

  const metrics = (model?.metrics ?? {}) as { accuracy?: number };

  return {
    database: { ok: dbOk, message: dbMessage },
    model: {
      trained: Boolean(model),
      version: model?.version ?? null,
      accuracy: typeof metrics.accuracy === "number" ? metrics.accuracy : null,
      roundsCompleted: model?.rounds_completed ?? 0,
      participatingHospitals: model?.participating_hospitals ?? 0,
      trainedAt: model?.created_at ?? null,
      featureCount: ((model?.feature_names as string[] | null) ?? FEATURE_NAMES).length,
    },
    federated: {
      hospitalsTotal,
      hospitalsApproved,
      hospitalsWithData,
      totalTrainingSamples,
      lastRunAt: lastRound?.created_at ?? null,
    },
    ledger: {
      valid: Boolean(v?.valid),
      total: Number(v?.total ?? 0),
      firstBrokenSeq: v?.first_broken_seq ?? null,
    },
    privacy: {
      differentialPrivacy: (model?.dp_noise_multiplier ?? DEFAULT_CONFIG.noiseMultiplier) > 0,
      noiseMultiplier: model?.dp_noise_multiplier ?? DEFAULT_CONFIG.noiseMultiplier,
      clipNorm: model?.dp_clip_norm ?? DEFAULT_CONFIG.clipNorm,
      secureAggregation: model?.secure_aggregation ?? true,
      rowLevelSecurity: true,
    },
  };
}

/** Re-evaluate the active model on the held-out data - used by the status page. */
export async function evaluateActiveModel() {
  const model = await activeModel();
  if (!model) return null;
  const partitions = await loadPartitions();
  const stats = {
    means: model.feature_means,
    stds: model.feature_stds,
    count: model.training_samples,
  };
  const x = partitions.flatMap((p) => standardise(p.test.x, stats));
  const y = partitions.flatMap((p) => p.test.y);
  if (!x.length) return null;
  return evaluate(x, y, model.weights, model.bias);
}
