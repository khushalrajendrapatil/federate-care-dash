import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Cpu, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { AccuracyChart } from "@/components/AccuracyChart";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listDatasets, trainGlobalModel } from "@/lib/fl.functions";
import type { TrainingResultDto } from "@/lib/fl-types";

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({
    meta: [
      { title: "Train global model — MedFed" },
      {
        name: "description",
        content:
          "Run federated training across participating hospitals and review round-by-round accuracy.",
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

function TrainingPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const trainFn = useServerFn(trainGlobalModel);
  const datasetsFn = useServerFn(listDatasets);

  const [rounds, setRounds] = useState(15);
  const [localEpochs, setLocalEpochs] = useState(8);
  const [noise, setNoise] = useState(0.05);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TrainingResultDto | null>(null);
  const [error, setError] = useState<unknown>(null);

  const datasets = useQuery({
    queryKey: ["datasets", "all"],
    queryFn: () => datasetsFn(),
    enabled: role === "admin",
    retry: false,
  });

  const start = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await trainFn({ data: { rounds, localEpochs, noiseMultiplier: noise } });
      setResult(res);
      toast.success(`Training complete — model ${res.version} is now active.`);
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["ledger"] });
      void qc.invalidateQueries({ queryKey: ["system-status"] });
      void qc.invalidateQueries({ queryKey: ["feature-schema"] });
    } catch (err) {
      setError(err);
    } finally {
      setRunning(false);
    }
  };

  if (role !== "admin") {
    return <p className="text-sm text-muted-foreground">Administrator access only.</p>;
  }

  const participants = datasets.data ?? [];
  const totalSamples = participants.reduce((a, d) => a + d.sampleCount, 0);

  return (
    <>
      <PageHeader
        title="Train global model"
        description="Federated averaging runs server-side across each hospital's own dataset. Raw records never leave their hospital's shard — only clipped, noised model updates are aggregated."
      />

      <Alert className="mb-6">
        <ShieldCheck className="size-4" />
        <AlertDescription>
          {participants.length} hospital dataset{participants.length === 1 ? "" : "s"} registered ·{" "}
          {totalSamples} samples available. Hospitals import or upload their data on the Datasets
          page.
        </AlertDescription>
      </Alert>

      <Card className="mb-6 shadow-[var(--shadow-card)]">
        <CardContent className="flex flex-wrap items-end gap-4 p-6">
          <div className="w-36 space-y-2">
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
          <div className="w-36 space-y-2">
            <Label htmlFor="epochs">Local epochs</Label>
            <Input
              id="epochs"
              type="number"
              min={1}
              max={50}
              value={localEpochs}
              disabled={running}
              onChange={(e) => setLocalEpochs(Number(e.target.value) || 1)}
            />
          </div>
          <div className="w-44 space-y-2">
            <Label htmlFor="noise">DP noise multiplier</Label>
            <Input
              id="noise"
              type="number"
              step="0.01"
              min={0}
              max={2}
              value={noise}
              disabled={running}
              onChange={(e) => setNoise(Number(e.target.value))}
            />
          </div>
          <Button onClick={() => void start()} disabled={running}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Cpu className="size-4" />}
            {running ? "Training…" : "Start training"}
          </Button>
        </CardContent>
      </Card>

      {running ? (
        <Card className="mb-6 shadow-[var(--shadow-card)]">
          <CardContent className="space-y-3 p-6">
            <p className="text-sm font-medium">
              Running {rounds} federated rounds server-side — local training, clipping, noise,
              secure aggregation and evaluation.
            </p>
            <Progress value={undefined} className="animate-pulse" />
            <p className="text-xs text-muted-foreground">
              Results appear only when the run has genuinely finished. Keep this page open.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <div className="mb-6">
          <ApiErrorNotice error={error} title="Training failed" />
        </div>
      ) : null}

      {result ? (
        <div className="space-y-6">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">
                Accuracy per round · {result.participatingHospitals} hospitals ·{" "}
                {result.trainSamples} train / {result.testSamples} test samples
              </CardTitle>
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
                    <TableHead>Weights hash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rounds.map((r) => (
                    <TableRow key={r.round}>
                      <TableCell>{r.round}</TableCell>
                      <TableCell>{r.globalAccuracy.toFixed(2)}%</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.locals.length
                          ? r.locals.map((l) => `${l.hospital}: ${l.accuracy.toFixed(2)}%`).join(" · ")
                          : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.weightsHash.slice(0, 12)}…
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">Final global metrics · {result.version}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-4">
              {Object.entries(result.finalMetrics).map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, " ")}</p>
                  <p className="font-display text-xl font-semibold">{Number(v).toFixed(2)}%</p>
                </div>
              ))}
              <div className="sm:col-span-4">
                <p className="text-xs text-muted-foreground">Ledger block hash</p>
                <p className="font-mono text-xs break-all">{result.ledgerHash}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
