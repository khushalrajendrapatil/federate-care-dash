/**
 * One-click connectivity / permissions self-test.
 * Runs a handful of cheap probes with the caller's own RLS-scoped client so the
 * result reflects exactly what that user is allowed to do.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getRequest } from "@tanstack/react-start/server";
import { getFeatureSchema, readLedger, resolveActor } from "@/lib/fl.server";

export type ConnectivityCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  durationMs: number;
};

export type ConnectivityReport = {
  baseUrl: string;
  checkedAt: string;
  totalMs: number;
  ok: boolean;
  predictionsReady: boolean;
  checks: ConnectivityCheck[];
};

async function timed(
  id: string,
  label: string,
  run: () => Promise<{ status: ConnectivityCheck["status"]; detail: string }>,
): Promise<ConnectivityCheck> {
  const started = Date.now();
  try {
    const res = await run();
    return { id, label, ...res, durationMs: Date.now() - started };
  } catch (error) {
    return {
      id,
      label,
      status: "fail",
      detail: error instanceof Error ? error.message : "Unexpected failure.",
      durationMs: Date.now() - started,
    };
  }
}

export async function runConnectivityReport(
  client: SupabaseClient<Database>,
  userId: string,
  email?: string | null,
): Promise<ConnectivityReport> {
  const started = Date.now();

  let baseUrl = "unknown";
  try {
    baseUrl = new URL(getRequest().url).origin;
  } catch {
    /* ignore — origin is informational only */
  }

  const checks: ConnectivityCheck[] = [];

  checks.push(
    await timed("endpoint", "API endpoint reachable", async () => ({
      status: "pass",
      detail: `Server function responded from ${baseUrl}.`,
    })),
  );

  const actor = await resolveActor(client, userId, email);

  checks.push(
    await timed("auth", "Authentication & role", async () => ({
      status: "pass",
      detail: `Signed in as ${actor.label} — role: ${actor.isAdmin ? "admin" : "hospital"}.`,
    })),
  );

  checks.push(
    await timed("database", "Database read permission", async () => {
      const { count, error } = await client
        .from("hospitals")
        .select("id", { count: "exact", head: true });
      if (error) return { status: "fail" as const, detail: error.message };
      return { status: "pass" as const, detail: `Read access confirmed (${count ?? 0} hospitals visible).` };
    }),
  );

  let predictionsReady = false;

  checks.push(
    await timed("model", "Global model availability", async () => {
      const schema = await getFeatureSchema(client);
      if (!schema.trained) {
        return {
          status: "warn" as const,
          detail: "No global model has been trained yet — run a federated round before predicting.",
        };
      }
      predictionsReady = true;
      return {
        status: "pass" as const,
        detail: `Model ${schema.version} ready with ${schema.featureNames.length} features.`,
      };
    }),
  );

  checks.push(
    await timed("predictions", "Prediction write permission", async () => {
      const { error } = await client.from("predictions").select("id", { head: true, count: "exact" });
      if (error) return { status: "fail" as const, detail: error.message };
      if (actor.hospital && actor.hospital.status !== "approved") {
        predictionsReady = false;
        return {
          status: "warn" as const,
          detail: "Your hospital is awaiting administrator approval, so predictions are blocked.",
        };
      }
      return { status: "pass" as const, detail: "Prediction history is readable and writable for this account." };
    }),
  );

  checks.push(
    await timed("ledger", "Audit ledger integrity", async () => {
      const ledger = await readLedger(client, 25);
      if (!ledger.valid) {
        return { status: "fail" as const, detail: `Chain broken at record #${ledger.firstBrokenSeq ?? "?"}.` };
      }
      return { status: "pass" as const, detail: `Hash chain valid across ${ledger.total} records.` };
    }),
  );

  return {
    baseUrl,
    checkedAt: new Date().toISOString(),
    totalMs: Date.now() - started,
    ok: checks.every((c) => c.status !== "fail"),
    predictionsReady,
    checks,
  };
}
