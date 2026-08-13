/**
 * Client-safe list of the 30 diagnostic features used by the federated model.
 * Mirrors the column order of the Wisconsin Diagnostic Breast Cancer dataset
 * (UCI ML Repository), which is the corpus hospitals hold shards of.
 * The authoritative list for a given model is stored on the model row itself.
 */
export const FEATURE_NAMES: string[] = [
  "mean radius",
  "mean texture",
  "mean perimeter",
  "mean area",
  "mean smoothness",
  "mean compactness",
  "mean concavity",
  "mean concave points",
  "mean symmetry",
  "mean fractal dimension",
  "SE radius",
  "SE texture",
  "SE perimeter",
  "SE area",
  "SE smoothness",
  "SE compactness",
  "SE concavity",
  "SE concave points",
  "SE symmetry",
  "SE fractal dimension",
  "worst radius",
  "worst texture",
  "worst perimeter",
  "worst area",
  "worst smoothness",
  "worst compactness",
  "worst concavity",
  "worst concave points",
  "worst symmetry",
  "worst fractal dimension",
];

export const N_FEATURES = FEATURE_NAMES.length;

/** Number of fixed shards the public corpus is partitioned into. */
export const SHARD_COUNT = 6;
