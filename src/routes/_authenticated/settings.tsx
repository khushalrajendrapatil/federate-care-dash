import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { getSystemStatus, runConnectivityTest } from "@/lib/fl.functions";


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

function ConnectivityCard() {
  const testFn = useServerFn(runConnectivityTest);
  const test = useMutation({ mutationFn: () => testFn() });
  const report = test.data;

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">API connectivity test</CardTitle>
          <CardDescription>
            Run a one-click health check that confirms the API base URL, your session permissions
            and model readiness before you use predictions.
          </CardDescription>
        </div>
        <Button onClick={() => test.mutate()} disabled={test.isPending}>
          {test.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PlugZap className="size-4" />
          )}
          {test.isPending ? "Testing…" : "Run test"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {test.error ? <ApiErrorNotice error={test.error} title="Connectivity test failed" /> : null}

        {report ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={report.ok ? "default" : "destructive"}>
                {report.ok ? "All checks passed" : "Problems found"}
              </Badge>
              <Badge variant={report.predictionsReady ? "default" : "secondary"}>
                {report.predictionsReady ? "Predictions ready" : "Predictions unavailable"}
              </Badge>
              <span className="text-muted-foreground">
                Base URL: <span className="font-medium text-foreground">{report.baseUrl}</span> ·{" "}
                {report.totalMs} ms · {new Date(report.checkedAt).toLocaleTimeString()}
              </span>
            </div>

            <ul className="divide-y divide-border">
              {report.checks.map((check) => (
                <li key={check.id} className="flex items-start gap-3 py-2">
                  {check.status === "pass" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-risk-low" />
                  ) : check.status === "warn" ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-risk-moderate" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-risk-high" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{check.label}</p>
                    <p className="text-sm text-muted-foreground">{check.detail}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{check.durationMs} ms</span>
                </li>
              ))}
            </ul>
          </>
        ) : test.isPending ? (
          <Skeleton className="h-24" />
        ) : (
          <p className="text-sm text-muted-foreground">
            No test has been run yet in this session.
          </p>
        )}
      </CardContent>
    </Card>
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

      <div className="mb-6">
        <ConnectivityCard />
      </div>



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
