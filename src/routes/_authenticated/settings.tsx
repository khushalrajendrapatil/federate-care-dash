import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, getApiBaseUrl, setApiBaseUrl } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MedFed" },
      {
        name: "description",
        content: "Configure the federated learning service URL and review your account details.",
      },
      { property: "og:title", content: "Settings — MedFed" },
      {
        property: "og:description",
        content: "Connection settings for the MedFed federated learning prediction service.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { role, hospital, user } = useAuth();
  const [url, setUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => setUrl(getApiBaseUrl()), []);

  const save = () => {
    setApiBaseUrl(url);
    setStatus("idle");
    toast.success("Service URL saved for this browser.");
  };

  const test = async () => {
    setChecking(true);
    setStatus("idle");
    setApiBaseUrl(url);
    try {
      await apiFetch<unknown>("/api/feature-names", { timeoutMs: 15_000 });
      setStatus("ok");
    } catch (err) {
      setStatus("fail");
      toast.error(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Connection and account details." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Federated learning service</CardTitle>
            <CardDescription>
              Base URL of the Python API that performs training, predictions, SHAP explanations and
              the ledger. Defaults to the VITE_ML_API_BASE_URL environment variable; the value below
              overrides it in this browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-url">API base URL</Label>
              <Input
                id="api-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-service.onrender.com"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={save}>Save</Button>
              <Button variant="outline" onClick={() => void test()} disabled={checking}>
                {checking ? <Loader2 className="size-4 animate-spin" /> : null} Test connection
              </Button>
              {status === "ok" ? (
                <span className="flex items-center gap-1.5 text-sm text-risk-low">
                  <CheckCircle2 className="size-4" /> Reachable
                </span>
              ) : status === "fail" ? (
                <span className="flex items-center gap-1.5 text-sm text-risk-high">
                  <XCircle className="size-4" /> Unreachable
                </span>
              ) : null}
            </div>
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
    </>
  );
}
