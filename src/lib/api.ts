/**
 * Thin HTTP client for the external Python federated-learning API.
 * Base URL is configurable via VITE_ML_API_BASE_URL, with a runtime
 * override stored in localStorage so it can be swapped without a rebuild.
 */

const STORAGE_KEY = "fl_api_base_url";

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const override = window.localStorage.getItem(STORAGE_KEY);
    if (override) return override.replace(/\/+$/, "");
  }
  const env = import.meta.env["VITE_ML_API_BASE_URL"] as string | undefined;
  return (env ?? "").replace(/\/+$/, "");
}

export function setApiBaseUrl(url: string) {
  if (typeof window === "undefined") return;
  const trimmed = url.trim().replace(/\/+$/, "");
  if (trimmed) window.localStorage.setItem(STORAGE_KEY, trimmed);
  else window.localStorage.removeItem(STORAGE_KEY);
}

export class ApiError extends Error {
  status: number;
  notTrained: boolean;
  constructor(message: string, status = 0, notTrained = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.notTrained = notTrained;
  }
}

function looksNotTrained(text: string) {
  const t = text.toLowerCase();
  return t.includes("not trained") || t.includes("no model") || t.includes("model not");
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new ApiError(
      "No prediction service URL configured. Set it on the Settings page.",
      0,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 30_000);

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof DOMException && err.name === "AbortError";
    throw new ApiError(
      aborted
        ? "The prediction service took too long to respond (timed out)."
        : `Could not reach the prediction service at ${base}. It may be offline.`,
    );
  }
  clearTimeout(timeout);

  const raw = await res.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const detail =
      (parsed && typeof parsed === "object" && "detail" in parsed
        ? String((parsed as { detail: unknown }).detail)
        : null) ??
      (parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : null) ??
      raw ??
      `Request failed (${res.status})`;
    throw new ApiError(detail, res.status, looksNotTrained(detail));
  }

  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const detail = String((parsed as { error: unknown }).error);
    throw new ApiError(detail, res.status, looksNotTrained(detail));
  }

  return parsed as T;
}

/* ---------- Response normalisers (the API shape varies slightly) ---------- */

export type ShapItem = { feature: string; impact: number };

export type PredictionResult = {
  riskPercentage: number;
  riskLevel: string;
  recommendedAction: string;
  shap: ShapItem[];
};

export type RoundRecord = {
  round: number;
  globalAccuracy: number | null;
  locals: { hospital: string; accuracy: number }[];
  metrics: Record<string, number>;
};

export type TrainingResult = {
  rounds: RoundRecord[];
  finalMetrics: Record<string, number>;
  blockHash: string | null;
  version: string;
};

export type AuditBlock = {
  round: number | string;
  timestamp: string | null;
  weightsHash: string;
  previousHash: string | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

export function normalizeFeatureNames(data: unknown): string[] {
  if (Array.isArray(data)) return data.map(String);
  const o = rec(data);
  for (const key of ["feature_names", "features", "names", "data"]) {
    const v = o[key];
    if (Array.isArray(v)) return v.map(String);
  }
  return [];
}

export function normalizeShap(data: unknown): ShapItem[] {
  const raw = Array.isArray(data)
    ? data
    : (() => {
        const o = rec(data);
        for (const key of ["shap_explanation", "shap", "explanation", "shap_values", "top_features"]) {
          if (o[key]) return o[key];
        }
        return null;
      })();

  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (Array.isArray(entry) && entry.length >= 2) {
          return { feature: String(entry[0]), impact: num(entry[1]) ?? 0 };
        }
        const o = rec(entry);
        const feature = String(o["feature"] ?? o["name"] ?? o["feature_name"] ?? "");
        const impact =
          num(o["impact"]) ?? num(o["value"]) ?? num(o["shap_value"]) ?? num(o["contribution"]) ?? 0;
        return { feature, impact };
      })
      .filter((s) => s.feature);
  }

  if (raw && typeof raw === "object") {
    return Object.entries(rec(raw)).map(([feature, value]) => ({
      feature,
      impact: num(value) ?? 0,
    }));
  }
  return [];
}

export function normalizePrediction(data: unknown): PredictionResult {
  const o = rec(data);
  const inner = rec(o["prediction"] ?? o["result"]);
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = o[k] ?? inner[k];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  };

  let risk = num(pick("risk_percentage", "risk", "risk_score", "probability")) ?? 0;
  if (risk <= 1) risk = risk * 100;

  const level = String(
    pick("risk_level", "level", "category") ??
      (risk >= 70 ? "High" : risk >= 40 ? "Moderate" : "Low"),
  );

  return {
    riskPercentage: Math.round(risk * 100) / 100,
    riskLevel: level,
    recommendedAction: String(pick("recommended_action", "recommendation", "action") ?? ""),
    shap: normalizeShap(o["shap_explanation"] ?? o["shap"] ?? o["explanation"] ?? inner),
  };
}

export function normalizeTraining(data: unknown): TrainingResult {
  const o = rec(data);
  const historyRaw =
    (o["history"] as unknown) ??
    (o["rounds"] as unknown) ??
    (o["training_history"] as unknown) ??
    (o["round_history"] as unknown) ??
    [];

  const rounds: RoundRecord[] = (Array.isArray(historyRaw) ? historyRaw : []).map((entry, i) => {
    const e = rec(entry);
    const global = rec(e["global"] ?? e["global_metrics"] ?? e["metrics"]);
    const localsRaw = e["local"] ?? e["locals"] ?? e["local_accuracies"] ?? e["clients"] ?? e["hospitals"];

    let locals: { hospital: string; accuracy: number }[] = [];
    if (Array.isArray(localsRaw)) {
      locals = localsRaw.map((l, idx) => {
        const lo = rec(l);
        return {
          hospital: String(lo["hospital"] ?? lo["client"] ?? lo["name"] ?? `Hospital ${idx + 1}`),
          accuracy: scale(num(lo["accuracy"]) ?? num(lo["acc"]) ?? 0),
        };
      });
    } else if (localsRaw && typeof localsRaw === "object") {
      locals = Object.entries(rec(localsRaw)).map(([hospital, v]) => ({
        hospital,
        accuracy: scale(num(v) ?? num(rec(v)["accuracy"]) ?? 0),
      }));
    }

    const globalAcc =
      num(global["accuracy"]) ?? num(e["global_accuracy"]) ?? num(e["accuracy"]) ?? null;

    const metrics: Record<string, number> = {};
    for (const [k, v] of Object.entries(global)) {
      const n = num(v);
      if (n !== null) metrics[k] = scale(n);
    }

    return {
      round: num(e["round"]) ?? num(e["round_number"]) ?? i + 1,
      globalAccuracy: globalAcc === null ? null : scale(globalAcc),
      locals,
      metrics,
    };
  });

  const finalRaw = rec(
    o["final_metrics"] ?? o["metrics"] ?? o["global_metrics"] ?? o["final"] ?? {},
  );
  const finalMetrics: Record<string, number> = {};
  for (const [k, v] of Object.entries(finalRaw)) {
    const n = num(v);
    if (n !== null) finalMetrics[k] = scale(n);
  }
  if (!finalMetrics["accuracy"] && rounds.length) {
    const last = rounds[rounds.length - 1];
    if (last?.globalAccuracy !== null && last?.globalAccuracy !== undefined) {
      finalMetrics["accuracy"] = last.globalAccuracy;
    }
  }

  const blockHash =
    (o["ledger_block_hash"] as string) ??
    (o["block_hash"] as string) ??
    (rec(o["block"])["hash"] as string) ??
    null;

  return {
    rounds,
    finalMetrics,
    blockHash: blockHash ? String(blockHash) : null,
    version: String(o["version"] ?? o["model_version"] ?? `v${new Date().toISOString().slice(0, 16)}`),
  };
}

/** Metrics may come as 0-1 fractions or 0-100 percentages; normalise to percent. */
function scale(n: number): number {
  const v = n <= 1 ? n * 100 : n;
  return Math.round(v * 100) / 100;
}

export function normalizeAudit(data: unknown): { valid: boolean; blocks: AuditBlock[] } {
  const o = rec(data);
  const chainRaw = Array.isArray(data)
    ? data
    : (o["chain"] ?? o["blocks"] ?? o["audit_trail"] ?? o["ledger"] ?? []);

  const blocks: AuditBlock[] = (Array.isArray(chainRaw) ? chainRaw : []).map((b, i) => {
    const e = rec(b);
    return {
      round: (num(e["round"]) ?? num(e["round_number"]) ?? num(e["index"]) ?? i) as number,
      timestamp: e["timestamp"] ? String(e["timestamp"]) : e["time"] ? String(e["time"]) : null,
      weightsHash: String(e["weights_hash"] ?? e["hash"] ?? e["block_hash"] ?? ""),
      previousHash: e["previous_hash"]
        ? String(e["previous_hash"])
        : e["prev_hash"]
          ? String(e["prev_hash"])
          : null,
    };
  });

  const valid = typeof o["valid"] === "boolean" ? (o["valid"] as boolean) : Boolean(o["is_valid"]);
  return { valid, blocks };
}
