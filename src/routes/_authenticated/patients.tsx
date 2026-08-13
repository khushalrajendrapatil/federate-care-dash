import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Info, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/patients")({
  head: () => ({
    meta: [
      { title: "Patient records — MedFed" },
      {
        name: "description",
        content: "Manage your hospital's demo patient records: age, gender, disease category and diagnosis notes.",
      },
      { property: "og:title", content: "Patient records — MedFed" },
      {
        property: "og:description",
        content: "Hospital-scoped demo patient record management for federated model training.",
      },
    ],
  }),
  component: PatientsPage,
});

const CATEGORIES = [
  "Oncology",
  "Cardiology",
  "Endocrinology",
  "Neurology",
  "Pulmonology",
  "Nephrology",
  "Other",
];
const GENDERS = ["Female", "Male", "Other"];

type Patient = {
  id: string;
  age: number;
  gender: string;
  disease_category: string;
  diagnosis: string | null;
  created_at: string;
};

function PatientsPage() {
  const { hospital } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<Patient | null>(null);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["patients", hospital?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Patient[];
    },
    enabled: Boolean(hospital?.id),
  });

  const save = useMutation({
    mutationFn: async (payload: Omit<Patient, "id" | "created_at"> & { id?: string }) => {
      if (!hospital?.id) throw new Error("No approved hospital linked to this account.");
      if (payload.id) {
        const { error } = await supabase
          .from("patients")
          .update({
            age: payload.age,
            gender: payload.gender,
            disease_category: payload.disease_category,
            diagnosis: payload.diagnosis,
          })
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("patients").insert({
          hospital_id: hospital.id,
          age: payload.age,
          gender: payload.gender,
          disease_category: payload.disease_category,
          diagnosis: payload.diagnosis,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Patient record saved.");
      setOpen(false);
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("patients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Patient record deleted.");
      void qc.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (data ?? []).filter((p) => {
    const matchesCategory = category === "all" || p.disease_category === category;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.disease_category.toLowerCase().includes(q) ||
      (p.diagnosis ?? "").toLowerCase().includes(q) ||
      p.gender.toLowerCase().includes(q) ||
      String(p.age).includes(q);
    return matchesCategory && matchesSearch;
  });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    save.mutate({
      ...(editing ? { id: editing.id } : {}),
      age: Number(form.get("age")),
      gender: String(form.get("gender")),
      disease_category: String(form.get("disease_category")),
      diagnosis: String(form.get("diagnosis") ?? ""),
    });
  };

  return (
    <>
      <PageHeader
        title="Patient records"
        description="Records are visible only to your hospital. Administrators see aggregate counts only."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Add patient
          </Button>
        }
      />

      <Alert className="mb-5">
        <Info className="size-4" />
        <AlertDescription>
          Demo data only — do not enter real patient information.
        </AlertDescription>
      </Alert>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search diagnosis, category, age…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : !filtered.length ? (
            <p className="p-6 text-sm text-muted-foreground">No patient records found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Age</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Disease category</TableHead>
                  <TableHead>Diagnosis notes</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.age}</TableCell>
                    <TableCell>{p.gender}</TableCell>
                    <TableCell>{p.disease_category}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {p.diagnosis || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditing(p);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => remove.mutate(p.id)}>
                          <Trash2 className="size-4" />
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit patient record" : "Add patient record"}</DialogTitle>
            <DialogDescription>
              Demo data only — do not enter real patient information.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  name="age"
                  type="number"
                  min={0}
                  max={120}
                  required
                  defaultValue={editing?.age ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select name="gender" defaultValue={editing?.gender ?? "Female"}>
                  <SelectTrigger id="gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="disease_category">Disease category</Label>
              <Select
                name="disease_category"
                defaultValue={editing?.disease_category ?? "Oncology"}
              >
                <SelectTrigger id="disease_category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="diagnosis">Diagnosis notes</Label>
              <Textarea
                id="diagnosis"
                name="diagnosis"
                rows={3}
                defaultValue={editing?.diagnosis ?? ""}
                placeholder="Synthetic notes for this demo record"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={save.isPending}>
                Save record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
