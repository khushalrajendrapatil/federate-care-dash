import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, Link2, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, normalizeAudit } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Blockchain audit trail — MedFed" },
      {
        name: "description",
        content: "Verify the tamper-evident ledger of federated training rounds block by block.",
      },
      { property: "og:title", content: "Blockchain audit trail — MedFed" },
      {
        property: "og:description",
        content: "Chain integrity status and per-round weight hashes for the federated model ledger.",
      },
    ],
  }),
  component: AuditPage,
});

const truncate = (hash: string) => (hash.length > 16 ? `${hash.slice(0, 16)}…` : hash || "—");

function AuditPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-trail"],
    queryFn: async () => normalizeAudit(await apiFetch<unknown>("/api/audit-trail")),
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Blockchain audit trail"
        description="Every federated round is hashed into a chain linked to the previous block."
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : error ? (
        <ApiErrorNotice error={error} />
      ) : (
        <>
          <Card
            className={`mb-8 border-2 shadow-[var(--shadow-card)] ${
              data?.valid ? "border-risk-low/40 bg-risk-low/8" : "border-risk-high/40 bg-risk-high/8"
            }`}
          >
            <CardContent className="flex items-center gap-4 p-6">
              {data?.valid ? (
                <ShieldCheck className="size-9 text-risk-low" />
              ) : (
                <ShieldAlert className="size-9 text-risk-high" />
              )}
              <div>
                <p
                  className={`font-display text-2xl font-semibold ${
                    data?.valid ? "text-risk-low" : "text-risk-high"
                  }`}
                >
                  {data?.valid ? "Chain Valid ✓" : "Chain Broken ✗"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {data?.blocks.length ?? 0} block{data?.blocks.length === 1 ? "" : "s"} verified
                  against the federated learning service.
                </p>
              </div>
            </CardContent>
          </Card>

          {!data?.blocks.length ? (
            <p className="text-sm text-muted-foreground">
              The ledger is empty — no training rounds have been recorded yet.
            </p>
          ) : (
            <div className="space-y-1">
              {data.blocks.map((b, i) => (
                <div key={`${b.round}-${i}`}>
                  <Card className="shadow-[var(--shadow-card)]">
                    <CardContent className="flex flex-wrap items-center gap-6 p-5">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-display text-lg font-semibold text-primary">
                        {b.round}
                      </div>
                      <div className="min-w-40">
                        <p className="text-xs tracking-wide text-muted-foreground uppercase">
                          Round
                        </p>
                        <p className="text-sm font-medium">Block #{b.round}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.timestamp ? new Date(b.timestamp).toLocaleString() : "No timestamp"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs tracking-wide text-muted-foreground uppercase">
                          Weights hash
                        </p>
                        <p className="font-mono text-sm">{truncate(b.weightsHash)}</p>
                      </div>
                      <div>
                        <p className="text-xs tracking-wide text-muted-foreground uppercase">
                          Previous hash
                        </p>
                        <p className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
                          <Link2 className="size-3.5" />
                          {truncate(b.previousHash ?? "")}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  {i < data.blocks.length - 1 ? (
                    <div className="flex justify-center py-1">
                      <ArrowDown className="size-4 text-muted-foreground" />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
