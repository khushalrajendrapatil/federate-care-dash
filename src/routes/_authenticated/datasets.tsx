import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Database, Info, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteDataset, importDemoDataset, listDatasets, uploadDataset } from "@/lib/fl.functions";

export const Route = createFileRoute("/_authenticated/datasets")({
  head: () => ({
    meta: [
      { title: "Datasets — MedFed" },
      {
        name: "description",
        content: "Manage the local hospital datasets that take part in federated training rounds.",
      },
      { property: "og:title", content: "Datasets — MedFed" },
      {
        property: "og:description",
        content: "Import or upload the local training data your hospital contributes to MedFed.",
      },
    ],
  }),
  component: DatasetsPage,
});

function DatasetsPage() {
  const { role, hospital } = useAuth();
  const canManage = hospital?.status === "approved";
  const qc = useQueryClient();
  const listFn = useServerFn(listDatasets);
  const importFn = useServerFn(importDemoDataset);
  const uploadFn = useServerFn(uploadDataset);
  const deleteFn = useServerFn(deleteDataset);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const datasets = useQuery({
    queryKey: ["datasets", role],
    queryFn: () => listFn(),
    retry: false,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["datasets"] });
    void qc.invalidateQueries({ queryKey: ["system-status"] });
    void qc.invalidateQueries({ queryKey: ["ledger"] });
  };

  const runImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await importFn({});
      toast.success(`Imported ${res.samples} demo samples.`);
      refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const csv = await file.text();
      const res = await uploadFn({ data: { fileName: file.name, csv } });
      toast.success(`Uploaded ${res.samples} rows from ${file.name}.`);
      refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteFn({ data: { datasetId: id } });
      toast.success("Dataset removed.");
      refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const rows = datasets.data ?? [];

  return (
    <>
      <PageHeader
        title="Local datasets"
        description="Each hospital keeps its own training shard. Records stay in this hospital's rows; federated training only shares model updates."
      />

      <Alert className="mb-5">
        <Info className="size-4" />
        <AlertDescription>
          Demo data only — do not upload real patient information. CSV format: 30 numeric feature
          columns plus a final column with the label (0 = benign / low risk, 1 = malignant / high
          risk). A header row is optional.
        </AlertDescription>
      </Alert>

      {canManage ? (
        <Card className="mb-6 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Add training data</CardTitle>
            <CardDescription>
              Import the public demo shard assigned to your hospital, or upload your own CSV.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void runImport()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
              Import demo shard
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="size-4" /> Upload CSV
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <div className="mb-6">
          <ApiErrorNotice error={error} title="Dataset operation failed" />
        </div>
      ) : null}

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">
            {role === "admin" ? "All hospital datasets" : "My datasets"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {datasets.isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : datasets.error ? (
            <div className="p-6">
              <ApiErrorNotice error={datasets.error} title="Could not load datasets" />
            </div>
          ) : !rows.length ? (
            <p className="p-6 text-sm text-muted-foreground">
              No datasets yet. Hospitals must add data before a federated round can run.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  {role === "admin" ? <TableHead>Hospital</TableHead> : null}
                  <TableHead>Source</TableHead>
                  <TableHead>Samples</TableHead>
                  <TableHead>Train / test</TableHead>
                  <TableHead>Positives</TableHead>
                  <TableHead>Added</TableHead>
                  {canManage ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    {role === "admin" ? <TableCell>{d.hospitalName ?? "—"}</TableCell> : null}
                    <TableCell className="text-muted-foreground">{d.source}</TableCell>
                    <TableCell>{d.sampleCount}</TableCell>
                    <TableCell>
                      {d.trainCount} / {d.testCount}
                    </TableCell>
                    <TableCell>{d.positives}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          onClick={() => void remove(d.id)}
                          aria-label={`Delete ${d.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
