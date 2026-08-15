import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/AppShell";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { FederatedArchitecture, type HospitalNode } from "@/components/FederatedArchitecture";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { getSystemStatus, listDatasets } from "@/lib/fl.functions";

export const Route = createFileRoute("/_authenticated/workflow")({
  head: () => ({
    meta: [
      { title: "Federated Workflow — MedFed" },
      {
        name: "description",
        content:
          "End-to-end federated learning workflow: hospital data, local training, privacy, FedAvg aggregation, global model, prediction and audit.",
      },
      { property: "og:title", content: "Federated Workflow — MedFed" },
      {
        property: "og:description",
        content:
          "Live architecture diagram of the MedFed federated learning pipeline from hospital data to explainable prediction.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkflowPage,
});

function WorkflowPage() {
  const statusFn = useServerFn(getSystemStatus);
  const datasetsFn = useServerFn(listDatasets);

  const status = useQuery({ queryKey: ["system-status"], queryFn: () => statusFn(), retry: false });
  const datasets = useQuery({ queryKey: ["datasets"], queryFn: () => datasetsFn(), retry: false });

  const base = useQuery({
    queryKey: ["workflow-base"],
    queryFn: async () => {
      const [hospitals, patients, model, predictions] = await Promise.all([
        supabase.from("hospitals").select("id,name,status"),
        supabase.from("patients").select("id", { count: "exact", head: true }),
        supabase.from("global_models").select("metrics").eq("is_active", true).maybeSingle(),
        supabase.from("predictions").select("id", { count: "exact", head: true }),
      ]);
      if (hospitals.error) throw new Error(hospitals.error.message);
      return {
        hospitals: hospitals.data ?? [],
        patientCount: patients.count ?? 0,
        metrics: (model.data?.metrics ?? {}) as Record<string, number>,
        predictionCount: predictions.count ?? 0,
      };
    },
  });

  if (base.error) return <ApiErrorNotice error={base.error} title="Could not load the workflow" />;

  const samplesByHospital = new Map<string, number>();
  for (const d of datasets.data ?? []) {
    if (!d.hospitalName) continue;
    samplesByHospital.set(
      d.hospitalName,
      (samplesByHospital.get(d.hospitalName) ?? 0) + d.sampleCount,
    );
  }

  const nodes: HospitalNode[] = (base.data?.hospitals ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    status: h.status,
    samples: samplesByHospital.get(h.name) ?? 0,
  }));

  return (
    <>
      <PageHeader
        title="Federated learning workflow"
        description="Live end-to-end architecture — every box reflects the current state of your network."
      />

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">
            Federated learning for healthcare data privacy &amp; secure disease prediction
          </CardTitle>
          <CardDescription>
            Raw patient records never leave a hospital. Each site preprocesses its own data and
            trains a local model; only clipped, noise-added model updates are sent to the aggregator,
            combined with FedAvg into a global model, and redistributed for further rounds. Every
            step is appended to a hash-linked audit ledger, and predictions ship with SHAP
            explanations. Demo data only — do not enter real patient information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {base.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-64" />
              <Skeleton className="h-40" />
            </div>
          ) : (
            <FederatedArchitecture
              status={status.data}
              hospitals={nodes}
              metrics={base.data?.metrics ?? {}}
              patientCount={base.data?.patientCount ?? 0}
              predictionCount={base.data?.predictionCount ?? 0}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
