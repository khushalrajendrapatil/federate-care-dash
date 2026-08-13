import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SystemStatusDto } from "@/lib/fl-types";

export type PipelineStage = {
  label: string;
  detail: string;
  done: boolean;
};

export function buildPipelineStages(
  status: SystemStatusDto | undefined,
  patientCount: number,
): PipelineStage[] {
  const fed = status?.federated;
  const model = status?.model;
  const ledger = status?.ledger;
  return [
    {
      label: "Data sources",
      detail: `${fed?.hospitalsApproved ?? 0} approved hospital${fed?.hospitalsApproved === 1 ? "" : "s"}`,
      done: (fed?.hospitalsApproved ?? 0) > 0,
    },
    {
      label: "Patient / hospital records",
      detail: `${patientCount} patient record${patientCount === 1 ? "" : "s"}`,
      done: patientCount > 0,
    },
    {
      label: "Local training jobs",
      detail: `${fed?.hospitalsWithData ?? 0} hospital shard${fed?.hospitalsWithData === 1 ? "" : "s"} ready`,
      done: (fed?.hospitalsWithData ?? 0) > 0,
    },
    {
      label: "Training metrics stored",
      detail: `${fed?.totalTrainingSamples ?? 0} training samples`,
      done: (fed?.totalTrainingSamples ?? 0) > 0,
    },
    {
      label: "Federated aggregation",
      detail: model?.trained ? "Secure aggregation + DP applied" : "Waiting for a run",
      done: Boolean(model?.trained),
    },
    {
      label: "Federated rounds",
      detail: `${model?.roundsCompleted ?? 0} round${model?.roundsCompleted === 1 ? "" : "s"} completed`,
      done: (model?.roundsCompleted ?? 0) > 0,
    },
    {
      label: "Ledger audit records",
      detail: ledger ? `${ledger.total} events · ${ledger.valid ? "chain valid" : "chain broken"}` : "—",
      done: Boolean(ledger?.total),
    },
    {
      label: "Dashboard + explainability",
      detail: model?.trained ? "Predictions with SHAP available" : "Needs a trained model",
      done: Boolean(model?.trained),
    },
  ];
}

export function PipelineFlow({
  status,
  patientCount,
}: {
  status: SystemStatusDto | undefined;
  patientCount: number;
}) {
  const stages = buildPipelineStages(status, patientCount);

  return (
    <Card className="mb-6 shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-base">Federated pipeline</CardTitle>
        <CardDescription>
          Records stay local — only clipped, noised model updates are aggregated, and every step is
          appended to the hash-linked ledger.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-stretch gap-2">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-stretch gap-2">
            <div
              className={`min-w-44 rounded-lg border p-3 ${
                s.done ? "border-primary/40 bg-primary/8" : "border-border bg-muted/40"
              }`}
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={`size-2 rounded-full ${s.done ? "bg-risk-low" : "bg-muted-foreground/40"}`}
                  aria-hidden
                />
                {i + 1}. {s.label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
            </div>
            {i < stages.length - 1 ? (
              <ChevronRight className="size-4 self-center text-muted-foreground" aria-hidden />
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
