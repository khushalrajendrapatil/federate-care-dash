import type { ReactNode } from "react";
import { ArrowDown, CheckCircle2, CircleDashed } from "lucide-react";
import type { SystemStatusDto } from "@/lib/fl-types";

export type HospitalNode = { id: string; name: string; status: string; samples: number };

function Box({
  title,
  lines,
  done,
  tone = "default",
  className = "",
}: {
  title: string;
  lines?: (string | null | undefined)[];
  done?: boolean;
  tone?: "default" | "accent";
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-3 text-center ${
        tone === "accent"
          ? "border-primary/50 bg-primary/10"
          : done
            ? "border-primary/30 bg-primary/5"
            : "border-border bg-muted/40"
      } ${className}`}
    >
      <p className="flex items-center justify-center gap-1.5 text-sm font-medium">
        {done === undefined ? null : done ? (
          <CheckCircle2 className="size-3.5 text-risk-low" aria-hidden />
        ) : (
          <CircleDashed className="size-3.5 text-muted-foreground" aria-hidden />
        )}
        {title}
      </p>
      {lines?.filter(Boolean).map((l) => (
        <p key={l as string} className="mt-1 text-xs text-muted-foreground">
          {l}
        </p>
      ))}
    </div>
  );
}

function Down({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1.5">
      <ArrowDown className="size-4 text-muted-foreground" aria-hidden />
      {label ? <span className="text-[11px] text-muted-foreground">{label}</span> : null}
    </div>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-md">{children}</div>;
}

export function FederatedArchitecture({
  status,
  hospitals,
  metrics,
  patientCount,
  predictionCount,
}: {
  status: SystemStatusDto | undefined;
  hospitals: HospitalNode[];
  metrics: Record<string, number>;
  patientCount: number;
  predictionCount: number;
}) {
  const fed = status?.federated;
  const model = status?.model;
  const ledger = status?.ledger;
  const privacy = status?.privacy;
  const trained = Boolean(model?.trained);
  const acc = metrics["accuracy"] ?? model?.accuracy ?? null;
  const satisfactory = acc != null && acc >= 90;
  const shown = hospitals.slice(0, 3);

  const pct = (k: string) => (metrics[k] != null ? `${Number(metrics[k]).toFixed(2)}%` : "—");

  return (
    <div className="space-y-1">
      <Section>
        <Box
          title="Hospital registration & authentication"
          lines={[
            `${fed?.hospitalsTotal ?? hospitals.length} registered · ${fed?.hospitalsApproved ?? 0} approved`,
          ]}
          done={(fed?.hospitalsApproved ?? 0) > 0}
          tone="accent"
        />
        <Down />
        <Box
          title="Multiple healthcare hospitals"
          lines={[
            `${patientCount} private patient record${patientCount === 1 ? "" : "s"} visible to you`,
          ]}
          done={hospitals.length > 0}
        />
      </Section>

      <Down label="raw data never leaves the hospital" />

      <div className="grid gap-3 sm:grid-cols-3">
        {(shown.length
          ? shown
          : [{ id: "none", name: "No hospital yet", status: "pending", samples: 0 }]
        ).map((h) => (
          <div key={h.id} className="space-y-1">
            <Box
              title={h.name}
              lines={[`Private patient data`, `${h.samples} local dataset samples`, h.status]}
              done={h.samples > 0}
            />
            <Down />
            <Box
              title="Data preprocessing"
              lines={["Standardisation · train/test split"]}
              done={h.samples > 0}
            />
            <Down />
            <Box
              title="Local AI model training"
              lines={["Logistic regression · local epochs"]}
              done={h.samples > 0 && trained}
            />
          </div>
        ))}
      </div>
      {hospitals.length > 3 ? (
        <p className="pt-1 text-center text-xs text-muted-foreground">
          + {hospitals.length - 3} more hospital{hospitals.length - 3 === 1 ? "" : "s"}
        </p>
      ) : null}

      <Down label="model updates only" />

      <Section>
        <Box
          title="Privacy protection layer"
          lines={[
            privacy?.differentialPrivacy
              ? `Differential privacy · noise ×${privacy.noiseMultiplier}, clip ${privacy.clipNorm}`
              : "Differential privacy: off",
            privacy?.secureAggregation
              ? "Secure aggregation (pairwise masking)"
              : "Secure aggregation: off",
            privacy?.rowLevelSecurity
              ? "Row-level security + HTTPS transport"
              : "Row-level security: off",
          ]}
          done={Boolean(privacy?.differentialPrivacy && privacy?.secureAggregation)}
          tone="accent"
        />
        <Down />
        <Box
          title="Federated learning server / central aggregator"
          lines={["Server-side function inside this app"]}
          done={trained}
        />
        <Down />
        <Box
          title="Federated aggregation (FedAvg)"
          lines={[
            `Sample-weighted averaging · ${fed?.totalTrainingSamples ?? 0} local samples across ${fed?.hospitalsWithData ?? 0} site${fed?.hospitalsWithData === 1 ? "" : "s"}`,
          ]}
          done={(fed?.totalTrainingSamples ?? 0) > 0}
        />
        <Down />
        <Box
          title="Global AI model"
          lines={[
            model?.version ? `${model.version}` : "Not trained yet",
            `${model?.roundsCompleted ?? 0} communication round${model?.roundsCompleted === 1 ? "" : "s"}`,
          ]}
          done={trained}
          tone="accent"
        />
      </Section>

      <Down />

      <div className="grid gap-3 sm:grid-cols-2">
        <Box
          title="Model evaluation"
          lines={[
            `Accuracy ${pct("accuracy")}`,
            `Precision ${pct("precision")}`,
            `Recall ${pct("recall")}`,
            `F1 ${pct("f1")}${metrics["auc"] != null ? ` · AUC ${pct("auc")}` : ""}`,
          ]}
          done={trained}
        />
        <Box
          title="Audit / blockchain ledger"
          lines={[
            `${ledger?.total ?? 0} hash-linked records`,
            ledger ? (ledger.valid ? "Chain verified valid" : `Broken at #${ledger.firstBrokenSeq}`) : "—",
          ]}
          done={Boolean(ledger?.total)}
        />
      </div>

      <Down label="model satisfactory?" />

      <div className="grid gap-3 sm:grid-cols-2">
        <Box
          title="NO → new round / retrain"
          lines={["Redistribute global model to hospitals"]}
          done={!satisfactory && trained}
        />
        <Box
          title="YES → global model ready"
          lines={[acc != null ? `Accuracy ${acc.toFixed(2)}% ≥ 90% target` : "Awaiting first round"]}
          done={satisfactory}
        />
      </div>

      <Down />

      <Section>
        <Box
          title="Disease / risk prediction"
          lines={[`${predictionCount} prediction${predictionCount === 1 ? "" : "s"} recorded`]}
          done={predictionCount > 0}
        />
        <Down />
        <Box
          title="Prediction result + risk level + explanation"
          lines={["SHAP feature contributions per prediction"]}
          done={trained}
          tone="accent"
        />
      </Section>
    </div>
  );
}
