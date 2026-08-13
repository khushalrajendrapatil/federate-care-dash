import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/hospitals")({
  head: () => ({
    meta: [
      { title: "Hospital approvals — MedFed" },
      {
        name: "description",
        content: "Review, approve or reject hospital registrations for the federated network.",
      },
      { property: "og:title", content: "Hospital approvals — MedFed" },
      {
        property: "og:description",
        content: "Administrator view of hospital registrations in the MedFed network.",
      },
    ],
  }),
  component: HospitalsPage,
});

type Status = "pending" | "approved" | "rejected";

function statusClass(status: Status) {
  if (status === "approved") return "bg-risk-low/15 text-risk-low border-risk-low/30";
  if (status === "rejected") return "bg-risk-high/15 text-risk-high border-risk-high/30";
  return "bg-risk-moderate/15 text-risk-moderate border-risk-moderate/30";
}

function HospitalsPage() {
  const { role } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["hospitals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("hospitals").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      toast.success(`Hospital ${vars.status}.`);
      void qc.invalidateQueries({ queryKey: ["hospitals"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "admin") {
    return <p className="text-sm text-muted-foreground">Administrator access only.</p>;
  }

  return (
    <>
      <PageHeader
        title="Hospital registrations"
        description="Approve hospitals to grant them access to patient records and predictions."
      />
      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : !data?.length ? (
            <p className="p-6 text-sm text-muted-foreground">No hospitals registered yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hospital</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.name}</TableCell>
                    <TableCell className="text-muted-foreground">{h.location}</TableCell>
                    <TableCell className="text-muted-foreground">{h.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(h.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClass(h.status as Status)}>
                        {h.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={h.status === "approved" || setStatus.isPending}
                          onClick={() => setStatus.mutate({ id: h.id, status: "approved" })}
                        >
                          <Check className="size-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={h.status === "rejected" || setStatus.isPending}
                          onClick={() => setStatus.mutate({ id: h.id, status: "rejected" })}
                        >
                          <X className="size-3.5" /> Reject
                        </Button>
                      </div>
                    </TableCell>
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
