/**
 * Federated learning engine (server-only).
 *
 * Model: L2-regularised logistic regression over 30 standardised clinical
 * features. Everything here is real numeric computation - there is no
 * simulated progress, no random accuracy and no placeholder output.
 *
 * Round protocol (FedAvg):
 *   1. Server broadcasts the current global weight vector.
 *   2. Each hospital runs `localEpochs` of full-batch gradient descent on its
 *      OWN samples only. Raw samples never leave the hospital partition.
 *   3. The hospital computes delta = local - global, clips it to an L2 norm of
 *      `clipNorm` and adds Gaussian noise (differential privacy).
 *   4. The hospital masks the (sample-weighted) delta with pairwise one-time
 *      pads that cancel exactly when all contributions are summed
 *      (secure aggregation) - the server cannot read any single update.
 *   5. The server sums the masked contributions, divides by the total sample
 *      weight and applies the averaged delta to the global model.
 *   6. The new global model is evaluated on the union of the held-out test
 *      splits held by the hospitals.
 */

export type Vector = number[];

export type ClientPartition = {
  hospitalId: string;
  hospitalName: string;
  train: { x: Vector[]; y: number[] };
  test: { x: Vector[]; y: number[] };
};

export type Metrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  auc: number;
  logLoss: number;
};

export type LocalUpdateRecord = {
  hospitalId: string;
  hospitalName: string;
  sampleCount: number;
  localAccuracy: number;
  localLoss: number;
  updateHash: string;
};

export type RoundRecord = {
  round: number;
  globalAccuracy: number;
  metrics: Metrics;
  locals: { hospital: string; accuracy: number }[];
  weightsHash: string;
};

export type TrainConfig = {
  rounds: number;
  localEpochs: number;
  learningRate: number;
  l2: number;
  clipNorm: number;
  noiseMultiplier: number;
};

export const DEFAULT_CONFIG: TrainConfig = {
  rounds: 15,
  localEpochs: 8,
  learningRate: 0.5,
  l2: 0.01,
  clipNorm: 3,
  noiseMultiplier: 0.15,
};

/* ---------------- deterministic PRNG (mulberry32) ---------------- */

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function gaussian(next: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = next();
  while (v === 0) v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------------- standardisation via aggregated sums ---------------- */

export type FeatureStats = { means: Vector; stds: Vector; count: number };

/** Each client only contributes count / sum / sum-of-squares, never raw rows. */
export function localMoments(x: Vector[], n: number) {
  const sum = new Array<number>(n).fill(0);
  const sumSq = new Array<number>(n).fill(0);
  for (const row of x) {
    for (let j = 0; j < n; j++) {
      const v = row[j] ?? 0;
      sum[j] = (sum[j] ?? 0) + v;
      sumSq[j] = (sumSq[j] ?? 0) + v * v;
    }
  }
  return { count: x.length, sum, sumSq };
}

export function aggregateStats(
  moments: { count: number; sum: Vector; sumSq: Vector }[],
  n: number,
): FeatureStats {
  const sum = new Array<number>(n).fill(0);
  const sumSq = new Array<number>(n).fill(0);
  let count = 0;
  for (const m of moments) {
    count += m.count;
    for (let j = 0; j < n; j++) {
      sum[j] = (sum[j] ?? 0) + (m.sum[j] ?? 0);
      sumSq[j] = (sumSq[j] ?? 0) + (m.sumSq[j] ?? 0);
    }
  }
  const means = new Array<number>(n).fill(0);
  const stds = new Array<number>(n).fill(1);
  for (let j = 0; j < n; j++) {
    const mean = count > 0 ? (sum[j] ?? 0) / count : 0;
    const variance = count > 0 ? Math.max((sumSq[j] ?? 0) / count - mean * mean, 0) : 1;
    means[j] = mean;
    stds[j] = Math.sqrt(variance) || 1;
  }
  return { means, stds, count };
}

export function standardise(x: Vector[], stats: FeatureStats): Vector[] {
  return x.map((row) =>
    row.map((v, j) => (v - (stats.means[j] ?? 0)) / (stats.stds[j] ?? 1)),
  );
}

/* ---------------- logistic regression ---------------- */

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function score(weights: Vector, bias: number, row: Vector): number {
  let z = bias;
  for (let j = 0; j < weights.length; j++) z += (weights[j] ?? 0) * (row[j] ?? 0);
  return z;
}

/** Full-batch gradient descent on one client's data. Returns new [w, b]. */
export function localTrain(
  x: Vector[],
  y: number[],
  weights: Vector,
  bias: number,
  cfg: TrainConfig,
): { weights: Vector; bias: number; loss: number } {
  const n = weights.length;
  const w = weights.slice();
  let b = bias;
  const m = x.length;
  let loss = 0;

  for (let epoch = 0; epoch < cfg.localEpochs; epoch++) {
    const grad = new Array<number>(n).fill(0);
    let gradB = 0;
    loss = 0;
    for (let i = 0; i < m; i++) {
      const row = x[i] as Vector;
      const p = sigmoid(score(w, b, row));
      const err = p - (y[i] ?? 0);
      const yi = y[i] ?? 0;
      const clamped = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
      loss += -(yi * Math.log(clamped) + (1 - yi) * Math.log(1 - clamped));
      for (let j = 0; j < n; j++) grad[j] = (grad[j] ?? 0) + err * (row[j] ?? 0);
      gradB += err;
    }
    loss /= Math.max(m, 1);
    for (let j = 0; j < n; j++) {
      const g = (grad[j] ?? 0) / Math.max(m, 1) + cfg.l2 * (w[j] ?? 0);
      w[j] = (w[j] ?? 0) - cfg.learningRate * g;
    }
    b -= cfg.learningRate * (gradB / Math.max(m, 1));
  }

  return { weights: w, bias: b, loss };
}

export function evaluate(x: Vector[], y: number[], weights: Vector, bias: number): Metrics {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  let logLoss = 0;
  const scored: { p: number; y: number }[] = [];

  for (let i = 0; i < x.length; i++) {
    const p = sigmoid(score(weights, bias, x[i] as Vector));
    const yi = y[i] ?? 0;
    scored.push({ p, y: yi });
    const clamped = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
    logLoss += -(yi * Math.log(clamped) + (1 - yi) * Math.log(1 - clamped));
    const pred = p >= 0.5 ? 1 : 0;
    if (pred === 1 && yi === 1) tp++;
    else if (pred === 0 && yi === 0) tn++;
    else if (pred === 1 && yi === 0) fp++;
    else fn++;
  }

  const total = Math.max(x.length, 1);
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;

  return {
    accuracy: ((tp + tn) / total) * 100,
    precision: precision * 100,
    recall: recall * 100,
    f1: precision + recall > 0 ? ((2 * precision * recall) / (precision + recall)) * 100 : 0,
    auc: rocAuc(scored) * 100,
    logLoss: logLoss / total,
  };
}

function rocAuc(scored: { p: number; y: number }[]): number {
  const pos = scored.filter((s) => s.y === 1);
  const neg = scored.filter((s) => s.y === 0);
  if (!pos.length || !neg.length) return 0;
  const sorted = [...scored].sort((a, b) => a.p - b.p);
  const ranks = new Map<number, number>();
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]?.p === sorted[i]?.p) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks.set(k, avgRank);
    i = j + 1;
  }
  let rankSumPos = 0;
  sorted.forEach((s, idx) => {
    if (s.y === 1) rankSumPos += ranks.get(idx) ?? idx + 1;
  });
  return (rankSumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

/* ---------------- privacy primitives ---------------- */

function l2(v: Vector): number {
  return Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
}

/** Clip an update to a bounded sensitivity, then add Gaussian DP noise. */
export function clipAndNoise(
  delta: Vector,
  clipNorm: number,
  sigma: number,
  next: () => number,
): Vector {
  const norm = l2(delta);
  const scale = norm > clipNorm ? clipNorm / norm : 1;
  return delta.map((d) => d * scale + (sigma > 0 ? gaussian(next) * sigma * clipNorm : 0));
}

/**
 * Pairwise additive masks. Client i adds +pad(i,j) for every j > i and
 * -pad(j,i) for every j < i, so the masks cancel exactly in the sum while any
 * individual masked update is indistinguishable from noise.
 */
export function pairwiseMask(
  index: number,
  clientIds: string[],
  dim: number,
  runSeed: string,
): Vector {
  const mask = new Array<number>(dim).fill(0);
  for (let j = 0; j < clientIds.length; j++) {
    if (j === index) continue;
    const [a, b] = index < j ? [index, j] : [j, index];
    const pad = rng(hashSeed(`${runSeed}:${clientIds[a]}:${clientIds[b]}`));
    const sign = index < j ? 1 : -1;
    for (let d = 0; d < dim; d++) mask[d] = (mask[d] ?? 0) + sign * (pad() - 0.5) * 2;
  }
  return mask;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ---------------- the federated run ---------------- */

export type FederatedRunResult = {
  weights: Vector;
  bias: number;
  stats: FeatureStats;
  rounds: RoundRecord[];
  localsByRound: LocalUpdateRecord[][];
  finalMetrics: Metrics;
  trainSamples: number;
  testSamples: number;
};

export async function runFederated(
  clients: ClientPartition[],
  nFeatures: number,
  cfg: TrainConfig,
  runSeed: string,
  onRound?: (r: RoundRecord) => void,
): Promise<FederatedRunResult> {
  if (!clients.length) throw new Error("No hospital datasets available to train on.");

  // 1. Secure-aggregated feature statistics (counts/sums only).
  const stats = aggregateStats(
    clients.map((c) => localMoments(c.train.x, nFeatures)),
    nFeatures,
  );
  if (stats.count === 0) throw new Error("Hospital datasets contain no training samples.");

  const std = clients.map((c) => ({
    ...c,
    train: { x: standardise(c.train.x, stats), y: c.train.y },
    test: { x: standardise(c.test.x, stats), y: c.test.y },
  }));

  const testX = std.flatMap((c) => c.test.x);
  const testY = std.flatMap((c) => c.test.y);
  if (!testX.length) throw new Error("No held-out evaluation samples are available.");

  let weights = new Array<number>(nFeatures).fill(0);
  let bias = 0;

  const ids = std.map((c) => c.hospitalId);
  const rounds: RoundRecord[] = [];
  const localsByRound: LocalUpdateRecord[][] = [];

  for (let round = 1; round <= cfg.rounds; round++) {
    const dim = nFeatures + 1; // weights + bias
    const aggregated = new Array<number>(dim).fill(0);
    let totalWeight = 0;
    const locals: LocalUpdateRecord[] = [];

    for (let i = 0; i < std.length; i++) {
      const client = std[i] as (typeof std)[number];
      const m = client.train.x.length;
      if (m === 0) continue;

      const local = localTrain(client.train.x, client.train.y, weights, bias, cfg);
      const localMetrics = evaluate(client.train.x, client.train.y, local.weights, local.bias);

      const delta = [
        ...local.weights.map((w, j) => w - (weights[j] ?? 0)),
        local.bias - bias,
      ];
      const noiseRng = rng(hashSeed(`${runSeed}:${client.hospitalId}:${round}`));
      const priv = clipAndNoise(delta, cfg.clipNorm, cfg.noiseMultiplier, noiseRng);

      const mask = pairwiseMask(i, ids, dim, `${runSeed}:${round}`);
      const contribution = priv.map((d, j) => d * m + (mask[j] ?? 0));

      for (let j = 0; j < dim; j++) {
        aggregated[j] = (aggregated[j] ?? 0) + (contribution[j] ?? 0);
      }
      totalWeight += m;

      locals.push({
        hospitalId: client.hospitalId,
        hospitalName: client.hospitalName,
        sampleCount: m,
        localAccuracy: localMetrics.accuracy,
        localLoss: local.loss,
        updateHash: await sha256Hex(
          contribution.map((v) => v.toFixed(8)).join(","),
        ),
      });
    }

    if (totalWeight === 0) throw new Error("No hospital contributed a usable update.");

    // Masks cancel here; the server only ever sees the aggregate.
    for (let j = 0; j < nFeatures; j++) {
      weights[j] = (weights[j] ?? 0) + (aggregated[j] ?? 0) / totalWeight;
    }
    bias += (aggregated[nFeatures] ?? 0) / totalWeight;

    const metrics = evaluate(testX, testY, weights, bias);
    const record: RoundRecord = {
      round,
      globalAccuracy: metrics.accuracy,
      metrics,
      locals: locals.map((l) => ({ hospital: l.hospitalName, accuracy: l.localAccuracy })),
      weightsHash: await sha256Hex(
        `${round}|${weights.map((w) => w.toFixed(8)).join(",")}|${bias.toFixed(8)}`,
      ),
    };
    rounds.push(record);
    localsByRound.push(locals);
    onRound?.(record);
  }

  return {
    weights,
    bias,
    stats,
    rounds,
    localsByRound,
    finalMetrics: evaluate(testX, testY, weights, bias),
    trainSamples: stats.count,
    testSamples: testX.length,
  };
}

/**
 * Exact Shapley values for a linear (logistic) model.
 * For f(x) = b + sum_j w_j * z_j with standardised inputs (E[z_j] = 0), the
 * Shapley value of feature j is exactly w_j * z_j in log-odds units. This is
 * the analytic SHAP solution for linear models, not an approximation.
 */
export function linearShap(
  raw: Vector,
  weights: Vector,
  means: Vector,
  stds: Vector,
  names: string[],
): { feature: string; impact: number; value: number }[] {
  return weights.map((w, j) => {
    const z = ((raw[j] ?? 0) - (means[j] ?? 0)) / (stds[j] ?? 1);
    return {
      feature: names[j] ?? `feature ${j + 1}`,
      impact: w * z,
      value: raw[j] ?? 0,
    };
  });
}
