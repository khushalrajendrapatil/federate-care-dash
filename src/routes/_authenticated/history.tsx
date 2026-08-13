import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { ShapChart } from "@/components/ShapChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ShapItem } from "@/lib/fl-types";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Prediction history — MedFed" },
      {
        name: "description",
        content: "Every recorded prediction with its model version, confidence and explanation.",
      },
      { property: "og:title", content: "Prediction history — MedFed" },
      {
        property: "og:description",
        content: "Audit-ready prediction history scoped to the hospitals you are allowed to see.",
      },
    ],
  }),
  component: HistoryPage,
});

type Row = {
  id: string;
  created_at: string;
  hospital_id: string | null;
  model_version: string | null;
  risk_percentage: number;
  risk_level: string;
  confidence: number | null;
  status: string;
  explanation_available: boolean;
  shap_explanation: unknown;
};

function riskClass(level: string) {
  const l = level.toLowerCase();
  if (l.includes("high")) return "bg-risk-high/15 text-risk-high border-risk-high/30";
  if (l.includes("mod") || l.includes("med"))
    return "bg-risk-moderate/15 text-risk-moderate border-risk-moderate/30";
  return "bg-risk-low/15 text-risk-low border-risk-low/30";
}

function HistoryPage() {
  const { role } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["prediction-history", role],
    queryFn: async () => {
      const [preds, hospitals] = await Promise.all([
        supabase
          .from("predictions")
          .select(
            "id,created_at,hospital_id,model_version,risk_percentage,risk_level,confidence,status,explanation_available,shap_explanation",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("hospitals").select("id,name"),
      ]);
      if (preds.error) throw new Error(preds.error.message);
      const names = new Map((hospitals.data ?? []).map((h) => [h.id, h.name]));
      return { rows: (preds.data ?? []) as Row[], names };
    },
  });

  const open = query.data?.rows.find((r) => r.id === openId) ?? null;
  const shap = (open?.shap_explanation ?? []) as ShapItem[];

  return (
    <>
      <PageHeader
        title="Prediction history"
        description="Row-level security limits this list to the records you are authorised to see."
      />

      {query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : query.error ? (
        <ApiErrorNotice error={query.error} title="Could not load prediction history" />
      ) : !query.data?.rows.length ? (
        <p className="text-sm text-muted-foreground">No predictions have been recorded yet.</p>
      ) : (
        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Hospital</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Explanation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {r.hospital_id ? (query.data.names.get(r.hospital_id) ?? "—") : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.model_version ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={riskClass(r.risk_level)}>
                        {r.risk_level} · {r.risk_percentage.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.confidence != null ? `${(r.confidence * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell className="capitalize">{r.status}</TableCell>
                    <TableCell>
                      {r.explanation_available ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setOpenId(openId === r.id ? null : r.id)}
                        >
                          {openId === r.id ? "Hide" : "View"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unavailable</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {open && shap.length ? (
        <Card className="mt-6 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">
              Explanation · {new Date(open.created_at).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ShapChart items={shap} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
