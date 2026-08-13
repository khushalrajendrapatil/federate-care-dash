import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { getSystemStatus } from "@/lib/fl.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MedFed" },
      {
        name: "description",
        content: "System status for the database, global model, federated learning and ledger.",
      },
      { property: "og:title", content: "Settings — MedFed" },
      {
        property: "og:description",
        content: "Service, model and privacy status for the MedFed federated learning platform.",
      },
    ],
  }),
  component: SettingsPage,
});

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        {ok === undefined ? null : ok ? (
          <CheckCircle2 className="size-4 text-risk-low" />
        ) : (
          <XCircle className="size-4 text-risk-high" />
        )}
        {value}
      </p>
    </div>
  );
}

function SettingsPage() {
  const { role, hospital, user } = useAuth();
  const statusFn = useServerFn(getSystemStatus);
  const { data, isLoading, error } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => statusFn(),
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Settings & system status"
        description="Everything runs inside this application — there is no external service to configure."
      />

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : error ? (
        <ApiErrorNotice error={error} title="Could not load system status" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">Services</CardTitle>
              <CardDescription>
                The AI, federated learning and ledger services run as server functions in this
                project.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatusRow
                label="Database"
                value={data!.database.message}
                ok={data!.database.ok}
              />
              <StatusRow label="AI prediction service" value="In-app server function" ok />
              <StatusRow
                label="Global model"
                value={data!.model.trained ? `Trained (${data!.model.version})` : "Not trained"}
                ok={data!.model.trained}
              />
              <StatusRow
                label="Model accuracy"
                value={data!.model.accuracy != null ? `${data!.model.accuracy.toFixed(2)}%` : "—"}
              />
              <StatusRow label="Feature count" value={String(data!.model.featureCount)} />
              <StatusRow
                label="Last successful training"
                value={
                  data!.model.trainedAt ? new Date(data!.model.trainedAt).toLocaleString() : "Never"
                }
              />
              <StatusRow label="Rounds completed" value={String(data!.model.roundsCompleted)} />
              <StatusRow
                label="Audit ledger"
                value={
                  data!.ledger.valid
                    ? `Valid · ${data!.ledger.total} records`
                    : `Broken at #${data!.ledger.firstBrokenSeq ?? "?"}`
                }
                ok={data!.ledger.valid}
              />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader>
                <CardTitle className="text-base">Federated learning</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusRow
                  label="Hospitals registered"
                  value={String(data!.federated.hospitalsTotal)}
                />
                <StatusRow
                  label="Approved hospitals"
                  value={String(data!.federated.hospitalsApproved)}
                />
                <StatusRow
                  label="Hospitals with data"
                  value={String(data!.federated.hospitalsWithData)}
                />
                <StatusRow
                  label="Training samples"
                  value={String(data!.federated.totalTrainingSamples)}
                />
                <StatusRow
                  label="Differential privacy"
                  value={`noise ×${data!.privacy.noiseMultiplier}, clip ${data!.privacy.clipNorm}`}
                  ok={data!.privacy.differentialPrivacy}
                />
                <StatusRow
                  label="Secure aggregation"
                  value={data!.privacy.secureAggregation ? "Enabled" : "Disabled"}
                  ok={data!.privacy.secureAggregation}
                />
                <StatusRow
                  label="Row-level security"
                  value={data!.privacy.rowLevelSecurity ? "Enforced" : "Off"}
                  ok={data!.privacy.rowLevelSecurity}
                />
              </CardContent>
            </Card>

            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader>
                <CardTitle className="text-base">Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p>{user?.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Role</p>
                  <p className="capitalize">{role ?? "—"}</p>
                </div>
                {hospital ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">Hospital</p>
                      <p>
                        {hospital.name} — {hospital.location}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="capitalize">{hospital.status}</p>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
