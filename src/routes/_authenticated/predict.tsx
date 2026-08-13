import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Info, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { ShapChart } from "@/components/ShapChart";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getFeatureSchema, runPrediction } from "@/lib/fl.functions";
import type { PredictionResult } from "@/lib/fl-types";

export const Route = createFileRoute("/_authenticated/predict")({
  head: () => ({
    meta: [
      { title: "Disease risk prediction — MedFed" },
      {
        name: "description",
        content: "Run an explainable disease-risk prediction against the federated global model.",
      },
      { property: "og:title", content: "Disease risk prediction — MedFed" },
      {
        property: "og:description",
        content: "Explainable risk scoring with SHAP contributing factors from the global model.",
      },
    ],
  }),
  component: PredictPage,
});

function riskToken(level: string) {
  const l = level.toLowerCase();
  if (l.includes("high"))
    return { text: "text-risk-high", bg: "bg-risk-high/12 border-risk-high/30" };
  if (l.includes("mod") || l.includes("med"))
    return { text: "text-risk-moderate", bg: "bg-risk-moderate/12 border-risk-moderate/30" };
  return { text: "text-risk-low", bg: "bg-risk-low/12 border-risk-low/30" };
}

function PredictPage() {
  const { hospital } = useAuth();
  const qc = useQueryClient();
  const schemaFn = useServerFn(getFeatureSchema);
  const predictFn = useServerFn(runPrediction);

  const [values, setValues] = useState<Record<string, string>>({});
  const [patientId, setPatientId] = useState("none");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  const schema = useQuery({
    queryKey: ["feature-schema"],
    queryFn: () => schemaFn(),
    retry: false,
  });

  const patients = useQuery({
    queryKey: ["patients-select", hospital?.id],
    queryFn: async () => {
      const { data, error: dbError } = await supabase
        .from("patients")
        .select("id,age,gender,disease_category")
        .order("created_at", { ascending: false });
      if (dbError) throw new Error(dbError.message);
      return data ?? [];
    },
    enabled: Boolean(hospital?.id),
  });

  const names = schema.data?.featureNames ?? [];
  const trained = schema.data?.trained ?? false;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const features = names.map((n) => Number(values[n] ?? 0));
      const res = await predictFn({
        data: { features, patientId: patientId === "none" ? null : patientId },
      });
      setResult(res);
      void qc.invalidateQueries({ queryKey: ["prediction-history"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["ledger"] });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const fillZeros = () => setValues(Object.fromEntries(names.map((n) => [n, values[n] ?? "0"])));

  return (
    <>
      <PageHeader
        title="Disease risk prediction"
        description="Feature values are scored by the current global federated model inside this application."
      />

      <Alert className="mb-5">
        <Info className="size-4" />
        <AlertDescription>Demo data only — do not enter real patient information.</AlertDescription>
      </Alert>

      {schema.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : schema.error ? (
        <ApiErrorNotice error={schema.error} title="Could not load the model schema" />
      ) : !trained ? (
        <ApiErrorNotice error={new Error("No global model has been trained yet.")} />
      ) : (
        <form onSubmit={submit} className="space-y-6">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">
                Clinical feature values ({names.length}) · model {schema.data?.version}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-3">
                <Select value={patientId} onValueChange={setPatientId}>
                  <SelectTrigger className="w-60">
                    <SelectValue placeholder="Link to a patient (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked patient</SelectItem>
                    {(patients.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.age}y · {p.gender} · {p.disease_category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={fillZeros}>
                  Fill blanks with 0
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {names.map((name) => (
                <div key={name} className="space-y-1.5">
                  <Label htmlFor={name} className="text-xs">
                    {name}
                  </Label>
                  <Input
                    id={name}
                    type="number"
                    step="any"
                    required
                    value={values[name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {submitting ? "Scoring…" : "Run prediction"}
          </Button>
        </form>
      )}

      {error ? (
        <div className="mt-6">
          <ApiErrorNotice error={error} title="Prediction failed" />
        </div>
      ) : null}

      {result ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <Card
            className={`shadow-[var(--shadow-card)] lg:col-span-2 ${riskToken(result.riskLevel).bg}`}
          >
            <CardContent className="space-y-4 p-6">
              <Badge variant="outline" className={riskToken(result.riskLevel).text}>
                {result.riskLevel} risk
              </Badge>
              <p
                className={`font-display text-5xl font-semibold ${riskToken(result.riskLevel).text}`}
              >
                {result.riskPercentage.toFixed(1)}%
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Model confidence</p>
                  <p>{(result.confidence * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Model version</p>
                  <p className="font-mono text-xs">{result.modelVersion}</p>
                </div>
              </div>
              <div>
                <p className="text-xs tracking-wide text-muted-foreground uppercase">
                  Recommended action
                </p>
                <p className="mt-1 text-sm">{result.recommendedAction}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)] lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Why the model decided this</CardTitle>
            </CardHeader>
            <CardContent>
              {result.explanationAvailable ? (
                <ShapChart items={result.shap} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  An explanation is not available for this prediction.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
