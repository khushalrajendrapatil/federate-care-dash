/**
 * Server functions for every ML / ledger operation in MedFed.
 * All heavy lifting lives in `@/lib/fl.server`, imported inside handlers so the
 * service-role client never reaches the browser bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  DatasetDto,
  LedgerDto,
  PredictionResult,
  SystemStatusDto,
  TrainingResultDto,
} from "@/lib/fl-types";

export const getSystemStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SystemStatusDto> => {
    const { systemStatus } = await import("@/lib/fl.server");
    return systemStatus(context.supabase);
  });

export const getFeatureSchema = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ trained: boolean; version: string | null; featureNames: string[] }> => {
    const { getFeatureSchema: schema } = await import("@/lib/fl.server");
    return schema(context.supabase);
  });

export const getLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LedgerDto> => {
    const { readLedger } = await import("@/lib/fl.server");
    return readLedger(context.supabase, 300);
  });

export const listDatasets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DatasetDto[]> => {
    const { resolveActor, listDatasets: list } = await import("@/lib/fl.server");
    const actor = await resolveActor(context.supabase, context.userId, context.claims?.email);
    return list(context.supabase, actor.isAdmin ? {} : { hospitalId: actor.hospital?.id ?? "none" });
  });

export const importDemoDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveActor, requireApprovedHospital, importPublicShard } = await import(
      "@/lib/fl.server"
    );
    const actor = await resolveActor(context.supabase, context.userId, context.claims?.email);
    const hospital = requireApprovedHospital(actor);
    return importPublicShard(context.supabase, hospital.id, actor.userId, actor.label);
  });

export const uploadDataset = createServerFn({ method: "POST" })
  .inputValidator((input: { fileName: string; csv: string }) => {
    if (!input || typeof input.csv !== "string" || input.csv.trim().length === 0) {
      throw new Error("The uploaded file is empty.");
    }
    if (input.csv.length > 4_000_000) throw new Error("The file is too large (limit 4 MB).");
    return { fileName: String(input.fileName ?? "upload.csv").slice(0, 120), csv: input.csv };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { resolveActor, requireApprovedHospital, importCsv } = await import("@/lib/fl.server");
    const actor = await resolveActor(context.supabase, context.userId, context.claims?.email);
    const hospital = requireApprovedHospital(actor);
    return importCsv(context.supabase, hospital.id, actor.userId, actor.label, data.fileName, data.csv);
  });

export const deleteDataset = createServerFn({ method: "POST" })
  .inputValidator((input: { datasetId: string }) => {
    if (!input?.datasetId) throw new Error("A dataset id is required.");
    return { datasetId: String(input.datasetId) };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { resolveActor, requireApprovedHospital, removeDataset } = await import("@/lib/fl.server");
    const actor = await resolveActor(context.supabase, context.userId, context.claims?.email);
    const hospital = requireApprovedHospital(actor);
    return removeDataset(context.supabase, data.datasetId, hospital.id, actor.userId, actor.label);
  });

export const trainGlobalModel = createServerFn({ method: "POST" })
  .inputValidator((input: { rounds: number; localEpochs: number; noiseMultiplier: number }) => {
    const rounds = Number(input?.rounds);
    const localEpochs = Number(input?.localEpochs);
    const noiseMultiplier = Number(input?.noiseMultiplier);
    if (!Number.isFinite(rounds) || rounds < 1 || rounds > 100) {
      throw new Error("Rounds must be a number between 1 and 100.");
    }
    if (!Number.isFinite(localEpochs) || localEpochs < 1 || localEpochs > 50) {
      throw new Error("Local epochs must be a number between 1 and 50.");
    }
    if (!Number.isFinite(noiseMultiplier) || noiseMultiplier < 0 || noiseMultiplier > 2) {
      throw new Error("The privacy noise multiplier must be between 0 and 2.");
    }
    return { rounds, localEpochs, noiseMultiplier };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<TrainingResultDto> => {
    const { resolveActor, requireAdmin, trainGlobal } = await import("@/lib/fl.server");
    const actor = await resolveActor(context.supabase, context.userId, context.claims?.email);
    requireAdmin(actor);
    return trainGlobal(context.supabase, actor.userId, actor.label, data);
  });

export const runPrediction = createServerFn({ method: "POST" })
  .inputValidator((input: { features: number[]; patientId?: string | null }) => {
    if (!input || !Array.isArray(input.features)) throw new Error("Feature values are required.");
    const features = input.features.map((v) => Number(v));
    if (features.some((v) => !Number.isFinite(v))) {
      throw new Error("Every feature value must be a valid number.");
    }
    return { features, patientId: input.patientId ? String(input.patientId) : null };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<PredictionResult> => {
    const { resolveActor, predict } = await import("@/lib/fl.server");
    const actor = await resolveActor(context.supabase, context.userId, context.claims?.email);
    if (actor.hospital && actor.hospital.status !== "approved") {
      throw new Error("Your hospital is awaiting administrator approval.");
    }
    return predict(
      context.supabase,
      actor.userId,
      actor.label,
      actor.hospital?.id ?? null,
      data.patientId,
      data.features,
    );
  });

export const logAuditEvent = createServerFn({ method: "POST" })
  .inputValidator((input: { eventType: string; payload?: Record<string, unknown> }) => {
    const allowed = ["auth.signed_in", "auth.signed_out"];
    if (!allowed.includes(input?.eventType)) throw new Error("Unsupported event type.");
    return { eventType: input.eventType, payload: input.payload ?? {} };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { resolveActor, recordAudit } = await import("@/lib/fl.server");
    const actor = await resolveActor(context.supabase, context.userId, context.claims?.email);
    await recordAudit({
      client: context.supabase,
      eventType: data.eventType,
      actorId: actor.userId,
      actorLabel: actor.label,
      hospitalId: actor.hospital?.id ?? null,
      payload: data.payload,
    });
    return { ok: true };
  });

export const setHospitalStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { hospitalId: string; status: "approved" | "rejected" }) => {
    if (!input?.hospitalId) throw new Error("A hospital id is required.");
    if (input.status !== "approved" && input.status !== "rejected") {
      throw new Error("Status must be approved or rejected.");
    }
    return { hospitalId: String(input.hospitalId), status: input.status };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { resolveActor, requireAdmin, recordAudit, notify } = await import("@/lib/fl.server");
    const actor = await resolveActor(context.supabase, context.userId, context.claims?.email);
    requireAdmin(actor);

    const { data: updated, error } = await context.supabase
      .from("hospitals")
      .update({ status: data.status })
      .eq("id", data.hospitalId)
      .select("id,name,owner_id")
      .single();
    if (error) throw new Error(`Could not update the hospital: ${error.message}`);

    await recordAudit({
      client: context.supabase,
      eventType: `hospital.${data.status}`,
      actorId: actor.userId,
      actorLabel: actor.label,
      hospitalId: updated.id,
      payload: { hospital: updated.name },
    });
    await notify(
      context.supabase,
      updated.owner_id,
      `Registration ${data.status}`,
      `${updated.name} has been ${data.status} by an administrator.`,
      data.status === "approved" ? "success" : "warning",
    );
    return { ok: true };
  });
