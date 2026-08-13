import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Cpu, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { AccuracyChart } from "@/components/AccuracyChart";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, normalizeTraining, type TrainingResult } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({
    meta: [
      { title: "Train global model — MedFed" },
      {
        name: "description",
        content: "Trigger a federated training run across participating hospitals and review round-by-round accuracy.",
      },
      { property: "og:title", content: "Train global model — MedFed" },
      {
        property: "og:description",
        content: "Administrator control for federated training rounds and global model metrics.",
      },
    ],
  }),
  component: TrainingPage,
});

const STAGES = [
  "Contacting the federated learning service…",
  "Distributing the global model to hospitals…",
  "Training locally at each hospital…",
  "Collecting encrypted model updates…",
  "Aggregating the global model…",
  "Evaluating global metrics and writing the ledger block…",
];

function TrainingPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [rounds, setRounds] = useState(15);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const start = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setStage(0);
    timer.current = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 9000);

    try {
      const raw = await apiFetch<unknown>(
        `/api/train?rounds=${rounds}&local_epochs=8`,
        { method: "POST", timeoutMs: 300_000 },
      );
      const parsed = normalizeTraining(raw);
      setResult(parsed);

      const { error: dbError } = await supabase.from("models").insert({
        version: parsed.version,
        accuracy: parsed.finalMetrics["accuracy"] ?? null,
        precision_score: parsed.finalMetrics["precision"] ?? null,
        recall: parsed.finalMetrics["recall"] ?? null,
        f1_score: parsed.finalMetrics["f1_score"] ?? parsed.finalMetrics["f1"] ?? null,
        rounds_completed: parsed.rounds.length || rounds,
        ledger_block_hash: parsed.blockHash,
        history: parsed.rounds as unknown as never,
      });
      if (dbError) toast.error(`Training finished, but saving metadata failed: ${dbError.message}`);
      else toast.success("Training complete — model metadata saved.");

      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["audit-trail"] });
    } catch (err) {
      setError(err);
    } finally {
      if (timer.current) clearInterval(timer.current);
      setRunning(false);
    }
  };

  if (role !== "admin") {
    return <p className="text-sm text-muted-foreground">Administrator access only.</p>;
  }

  return (
    <>
      <PageHeader
        title="Train global model"
        description="Runs a federated learning cycle on the prediction service. Training can take a minute or more."
      />

      <Card className="mb-6 shadow-[var(--shadow-card)]">
        <CardContent className="flex flex-wrap items-end gap-4 p-6">
          <div className="w-40 space-y-2">
            <Label htmlFor="rounds">Federated rounds</Label>
            <Input
              id="rounds"
              type="number"
              min={1}
              max={100}
              value={rounds}
              disabled={running}
              onChange={(e) => setRounds(Number(e.target.value) || 1)}
            />
          </div>
          <Button onClick={() => void start()} disabled={running}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Cpu className="size-4" />}
            {running ? "Training…" : "Start training"}
          </Button>
          <p className="text-xs text-muted-foreground">Local epochs per round: 8</p>
        </CardContent>
      </Card>

      {running ? (
        <Card className="mb-6 shadow-[var(--shadow-card)]">
          <CardContent className="space-y-3 p-6">
            <p className="text-sm font-medium">{STAGES[stage]}</p>
            <Progress value={((stage + 1) / STAGES.length) * 100} />
            <p className="text-xs text-muted-foreground">
              The federated learning service is computing this run. Keep this page open.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <div className="mb-6">
          <ApiErrorNotice error={error} />
        </div>
      ) : null}

      {result ? (
        <div className="space-y-6">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">Accuracy per round</CardTitle>
            </CardHeader>
            <CardContent>
              <AccuracyChart rounds={result.rounds} />
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">Round-by-round history</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Round</TableHead>
                    <TableHead>Global accuracy</TableHead>
                    <TableHead>Local accuracies</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rounds.map((r) => (
                    <TableRow key={r.round}>
                      <TableCell>{r.round}</TableCell>
                      <TableCell>
                        {r.globalAccuracy === null ? "—" : `${r.globalAccuracy.toFixed(2)}%`}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.locals.length
                          ? r.locals
                              .map((l) => `${l.hospital}: ${l.accuracy.toFixed(2)}%`)
                              .join(" · ")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">Final global metrics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-4">
              {Object.entries(result.finalMetrics).map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, " ")}</p>
                  <p className="font-display text-xl font-semibold">{v.toFixed(2)}%</p>
                </div>
              ))}
              {result.blockHash ? (
                <div className="sm:col-span-4">
                  <p className="text-xs text-muted-foreground">Ledger block hash</p>
                  <p className="font-mono text-xs break-all">{result.blockHash}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
