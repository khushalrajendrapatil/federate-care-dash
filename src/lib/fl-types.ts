/** Shared (client-safe) DTO types returned by the federated-learning server functions. */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ShapItem = { feature: string; impact: number; value: number };

export type PredictionResult = {
  predictionId: string;
  modelVersion: string;
  probability: number;
  riskPercentage: number;
  riskLevel: "Low" | "Moderate" | "High";
  confidence: number;
  predictedLabel: number;
  recommendedAction: string;
  explanationAvailable: boolean;
  shap: ShapItem[];
  baseline: number;
};

export type RoundDto = {
  round: number;
  globalAccuracy: number;
  metrics: Record<string, number>;
  locals: { hospital: string; accuracy: number }[];
  weightsHash: string;
};

export type TrainingResultDto = {
  modelId: string;
  version: string;
  rounds: RoundDto[];
  finalMetrics: Record<string, number>;
  participatingHospitals: number;
  trainSamples: number;
  testSamples: number;
  ledgerHash: string;
};

export type LedgerBlock = {
  seq: number;
  eventType: string;
  actor: string | null;
  modelVersion: string | null;
  roundNumber: number | null;
  payload: Record<string, JsonValue>;
  previousHash: string;
  hash: string;
  createdAt: string;
};

export type LedgerDto = {
  valid: boolean;
  total: number;
  firstBrokenSeq: number | null;
  blocks: LedgerBlock[];
};

export type SystemStatusDto = {
  database: { ok: boolean; message: string };
  model: {
    trained: boolean;
    version: string | null;
    accuracy: number | null;
    roundsCompleted: number;
    participatingHospitals: number;
    trainedAt: string | null;
    featureCount: number;
  };
  federated: {
    hospitalsTotal: number;
    hospitalsApproved: number;
    hospitalsWithData: number;
    totalTrainingSamples: number;
    lastRunAt: string | null;
  };
  ledger: { valid: boolean; total: number; firstBrokenSeq: number | null };
  privacy: {
    differentialPrivacy: boolean;
    noiseMultiplier: number;
    clipNorm: number;
    secureAggregation: boolean;
    rowLevelSecurity: boolean;
  };
};

export type DatasetDto = {
  id: string;
  name: string;
  source: string;
  sampleCount: number;
  trainCount: number;
  testCount: number;
  positives: number;
  createdAt: string;
  hospitalId: string;
  hospitalName: string | null;
};
