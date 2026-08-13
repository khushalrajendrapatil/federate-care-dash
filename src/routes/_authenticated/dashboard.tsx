import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, Gauge, Stethoscope, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { AccuracyChart } from "@/components/AccuracyChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { RoundRecord } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — MedFed" },
      {
        name: "description",
        content: "Federated network analytics: hospitals, patients, model accuracy and predictions.",
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

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", role, hospital?.id],
    queryFn: async () => {
      const [hospitals, patients, models, predictions] = await Promise.all([
        supabase.from("hospitals").select("id,name,status"),
        isAdmin
          ? supabase.from("patients").select("id", { count: "exact", head: true })
          : supabase
              .from("patients")
              .select("id", { count: "exact", head: true })
              .eq("hospital_id", hospital?.id ?? ""),
        supabase
          .from("models")
          .select("*")
          .order("training_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("predictions")
          .select("id,risk_percentage,risk_level,recommended_action,created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const { count: predictionCount } = await supabase
        .from("predictions")
        .select("id", { count: "exact", head: true });

      return {
        hospitals: hospitals.data ?? [],
        patientCount: patients.count ?? 0,
        model: models.data,
        predictions: (predictions.data ?? []) as PredictionRow[],
        predictionCount: predictionCount ?? 0,
      };
    },
  });

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

  const history = (data.model?.history ?? []) as unknown as RoundRecord[];
  const pending = data.hospitals.filter((h) => h.status === "pending").length;
  const accuracy = data.model?.accuracy != null ? `${Number(data.model.accuracy).toFixed(2)}%` : "—";

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
            : "Statistics scoped to your hospital only."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isAdmin ? (
          <StatCard
            label="Hospitals"
            value={data.hospitals.length}
            hint={`${pending} pending approval`}
            icon={Building2}
          />
        ) : (
          <StatCard
            label="Local accuracy"
            value={myLocal ? `${myLocal.accuracy.toFixed(2)}%` : "—"}
            hint={myLocal ? `Round ${myLocal.round}` : "Not in last training run"}
            icon={Activity}
          />
        )}
        <StatCard
          label="Patients"
          value={data.patientCount}
          hint={isAdmin ? "Across all hospitals" : "Your records"}
          icon={Users}
        />
        <StatCard
          label="Global model accuracy"
          value={accuracy}
          hint={data.model?.version ? `Version ${data.model.version}` : "No model trained yet"}
          icon={Gauge}
        />
        <StatCard
          label="Predictions"
          value={isAdmin ? data.predictionCount : data.predictions.length}
          hint={isAdmin ? "Logged network-wide" : "Logged by your hospital"}
          icon={Stethoscope}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="shadow-[var(--shadow-card)] lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Accuracy per federated round</CardTitle>
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
            {data.predictions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No predictions logged yet.</p>
            ) : (
              data.predictions.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {Number(p.risk_percentage).toFixed(1)}% risk
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="outline" className={riskClass(p.risk_level)}>
                    {p.risk_level}
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
