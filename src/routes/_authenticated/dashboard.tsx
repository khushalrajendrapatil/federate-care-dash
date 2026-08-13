import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Building2, Database, Gauge, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { AccuracyChart } from "@/components/AccuracyChart";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getSystemStatus } from "@/lib/fl.functions";
import type { RoundDto } from "@/lib/fl-types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — MedFed" },
      {
        name: "description",
        content:
          "Federated network analytics: hospitals, patients, model accuracy, privacy and predictions.",
      },
      { property: "og:title", content: "Dashboard — MedFed" },
      {
        property: "og:description",
        content: "Federated network analytics across hospitals, patients and model performance.",
      },
    ],
  }),
  component: DashboardPage,
});

type PredictionRow = {
  id: string;
  risk_percentage: number;
  risk_level: string;
  recommended_action: string | null;
  model_version: string | null;
  created_at: string;
};

function riskClass(level: string) {
  const l = level.toLowerCase();
  if (l.includes("high")) return "bg-risk-high/15 text-risk-high border-risk-high/30";
  if (l.includes("mod") || l.includes("med"))
    return "bg-risk-moderate/15 text-risk-moderate border-risk-moderate/30";
  return "bg-risk-low/15 text-risk-low border-risk-low/30";
}

function DashboardPage() {
  const { role, hospital } = useAuth();
  const isAdmin = role === "admin";
  const statusFn = useServerFn(getSystemStatus);

  const status = useQuery({
    queryKey: ["system-status"],
    queryFn: () => statusFn(),
    retry: false,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", role, hospital?.id],
    queryFn: async () => {
      const [hospitals, patients, model, predictions, predictionCount] = await Promise.all([
        supabase.from("hospitals").select("id,name,status"),
        isAdmin
          ? supabase.from("patients").select("id", { count: "exact", head: true })
          : supabase
              .from("patients")
              .select("id", { count: "exact", head: true })
              .eq("hospital_id", hospital?.id ?? ""),
        supabase
          .from("global_models")
          .select("version,metrics,history,rounds_completed,created_at")
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("predictions")
          .select("id,risk_percentage,risk_level,recommended_action,model_version,created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase.from("predictions").select("id", { count: "exact", head: true }),
      ]);

      if (hospitals.error) throw new Error(hospitals.error.message);

      return {
        hospitals: hospitals.data ?? [],
        patientCount: patients.count ?? 0,
        model: model.data,
        predictions: (predictions.data ?? []) as PredictionRow[],
        predictionCount: predictionCount.count ?? 0,
      };
    },
  });

  if (error) return <ApiErrorNotice error={error} title="Could not load the dashboard" />;

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const history = (data.model?.history ?? []) as unknown as RoundDto[];
  const pending = data.hospitals.filter((h) => h.status === "pending").length;
  const approved = data.hospitals.filter((h) => h.status === "approved").length;
  const metrics = (data.model?.metrics ?? {}) as Record<string, number>;
  const accuracy = metrics["accuracy"] != null ? `${Number(metrics["accuracy"]).toFixed(2)}%` : "—";

  const myLocal = (() => {
    if (isAdmin || !hospital) return null;
    for (let i = history.length - 1; i >= 0; i--) {
      const match = history[i]?.locals?.find(
        (l) => l.hospital.toLowerCase() === hospital.name.toLowerCase(),
      );
      if (match) return { round: history[i]!.round, accuracy: match.accuracy };
    }
    return null;
  })();

  return (
    <>
      <PageHeader
        title={isAdmin ? "Network overview" : `${hospital?.name ?? "Hospital"} overview`}
        description={
          isAdmin
            ? "Aggregate statistics across every participating hospital."
            : "Your hospital's data, participation and prediction activity."
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isAdmin ? (
          <>
            <StatCard
              icon={Building2}
              label="Hospitals"
              value={String(data.hospitals.length)}
              hint={`${approved} active · ${pending} pending`}
            />
            <StatCard icon={Users} label="Patients" value={String(data.patientCount)} />
          </>
        ) : (
          <>
            <StatCard icon={Users} label="My patients" value={String(data.patientCount)} />
            <StatCard
              icon={Database}
              label="My training samples"
              value={String(status.data?.federated.totalTrainingSamples ?? 0)}
              hint="Contributed to federated rounds"
            />
          </>
        )}
        <StatCard
          icon={Gauge}
          label="Global model accuracy"
          value={accuracy}
          hint={
            data.model
              ? `${data.model.version} · ${data.model.rounds_completed} rounds`
              : "No model trained yet"
          }
        />
        <StatCard
          icon={Stethoscope}
          label="Predictions"
          value={String(data.predictionCount)}
          hint={myLocal ? `My last local accuracy ${myLocal.accuracy.toFixed(2)}%` : undefined}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ShieldCheck}
          label="Ledger integrity"
          value={status.data ? (status.data.ledger.valid ? "Valid" : "Broken") : "—"}
          hint={`${status.data?.ledger.total ?? 0} audited events`}
        />
        <StatCard
          icon={Activity}
          label="Model status"
          value={status.data?.model.trained ? "Trained" : "Not trained"}
          hint={
            status.data?.model.trainedAt
              ? new Date(status.data.model.trainedAt).toLocaleString()
              : "Run a federated round"
          }
        />
        <StatCard
          icon={Database}
          label="Database"
          value={status.data?.database.ok ? "Connected" : "Unavailable"}
          hint={status.data?.database.message}
        />
        <StatCard
          icon={ShieldCheck}
          label="Privacy"
          value={status.data?.privacy.differentialPrivacy ? "DP + secure agg." : "—"}
          hint={
            status.data
              ? `noise ${status.data.privacy.noiseMultiplier} · clip ${status.data.privacy.clipNorm}`
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="shadow-[var(--shadow-card)] lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">
              Federated accuracy per round {data.model ? `· ${data.model.version}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AccuracyChart rounds={history} />
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)] lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent predictions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data.predictions.length ? (
              <p className="text-sm text-muted-foreground">No predictions recorded yet.</p>
            ) : (
              data.predictions.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{p.recommended_action ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString()}
                      {p.model_version ? ` · ${p.model_version}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className={riskClass(p.risk_level)}>
                    {p.risk_percentage.toFixed(1)}%
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
