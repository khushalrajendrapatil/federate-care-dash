import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, Link2, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getLedger } from "@/lib/fl.functions";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit trail — MedFed" },
      {
        name: "description",
        content: "Verify the tamper-evident hash-linked ledger of every federated learning event.",
      },
      { property: "og:title", content: "Audit trail — MedFed" },
      {
        property: "og:description",
        content: "Chain integrity status and per-event hashes for the federated learning ledger.",
      },
    ],
  }),
  component: AuditPage,
});

const truncate = (hash: string) => (hash && hash.length > 16 ? `${hash.slice(0, 16)}…` : hash || "—");

function AuditPage() {
  const ledgerFn = useServerFn(getLedger);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ledger"],
    queryFn: () => ledgerFn(),
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every login, dataset change, training round, aggregation and prediction is hashed into a chain linked to the previous record."
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : error ? (
        <ApiErrorNotice error={error} title="Could not load the audit ledger" />
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
                  {data?.total ?? 0} record{data?.total === 1 ? "" : "s"} re-hashed and verified
                  against their stored hashes.
                  {data && !data.valid && data.firstBrokenSeq != null
                    ? ` Tampering first detected at record #${data.firstBrokenSeq}.`
                    : ""}
                </p>
              </div>
            </CardContent>
          </Card>

          {!data?.blocks.length ? (
            <p className="text-sm text-muted-foreground">
              The ledger is empty — no auditable events have been recorded yet.
            </p>
          ) : (
            <div className="space-y-1">
              {data.blocks.map((b, i) => (
                <div key={b.seq}>
                  <Card className="shadow-[var(--shadow-card)]">
                    <CardContent className="flex flex-wrap items-center gap-6 p-5">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-display text-sm font-semibold text-primary">
                        #{b.seq}
                      </div>
                      <div className="min-w-48">
                        <Badge variant="outline">{b.eventType}</Badge>
                        <p className="mt-1 text-sm">{b.actor ?? "System"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(b.createdAt).toLocaleString()}
                          {b.roundNumber != null ? ` · round ${b.roundNumber}` : ""}
                          {b.modelVersion ? ` · ${b.modelVersion}` : ""}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs tracking-wide text-muted-foreground uppercase">
                          Record hash
                        </p>
                        <p className="font-mono text-sm">{truncate(b.hash)}</p>
                      </div>
                      <div>
                        <p className="text-xs tracking-wide text-muted-foreground uppercase">
                          Previous hash
                        </p>
                        <p className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
                          <Link2 className="size-3.5" />
                          {truncate(b.previousHash)}
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
