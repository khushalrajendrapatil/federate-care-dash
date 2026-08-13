import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listManagedUsers,
  resetUserPassword,
  setUserActive,
  type ManagedUser,
} from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Account management — MedFed Admin" },
      {
        name: "description",
        content:
          "Administrator console for MedFed accounts: review admin and hospital roles, reset passwords, and deactivate access.",
      },
      { property: "og:title", content: "Account management — MedFed Admin" },
      {
        property: "og:description",
        content: "Review roles, reset passwords, and deactivate MedFed hospital or admin accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const load = useServerFn(listManagedUsers);
  const reset = useServerFn(resetUserPassword);
  const toggle = useServerFn(setUserActive);

  const [target, setTarget] = useState<ManagedUser | null>(null);
  const [password, setPassword] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["managed-users"],
    queryFn: () => load(),
    enabled: role === "admin",
  });

  const resetMutation = useMutation({
    mutationFn: (input: { userId: string; password: string }) => reset({ data: input }),
    onSuccess: () => {
      toast.success("Password updated.");
      setTarget(null);
      setPassword("");
      void qc.invalidateQueries({ queryKey: ["managed-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeMutation = useMutation({
    mutationFn: (input: { userId: string; active: boolean }) => toggle({ data: input }),
    onSuccess: (_r, v) => {
      toast.success(v.active ? "Account reactivated." : "Account deactivated.");
      void qc.invalidateQueries({ queryKey: ["managed-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "admin") {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Administrator access is required to manage accounts.
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="Account management"
        description="Review admin and hospital accounts, reset passwords after email or credential changes, and deactivate access."
      />

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            {data ? `${data.length} account${data.length === 1 ? "" : "s"}` : "Loading accounts…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading accounts…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">Hospital</th>
                    <th className="py-2 pr-4 font-medium">Last sign-in</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data ?? []).map((u) => (
                    <tr key={u.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-4">
                        <span className="font-medium">{u.email}</span>
                        {u.id === user?.id ? (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                          {u.role ?? "none"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {u.hospitalName ? `${u.hospitalName} · ${u.hospitalStatus}` : "—"}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "never"}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={u.active ? "outline" : "destructive"}>
                          {u.active ? "Active" : "Deactivated"}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTarget(u);
                              setPassword("");
                            }}
                          >
                            <KeyRound className="size-3.5" /> Reset password
                          </Button>
                          <Button
                            size="sm"
                            variant={u.active ? "ghost" : "secondary"}
                            disabled={activeMutation.isPending || u.id === user?.id}
                            onClick={() =>
                              activeMutation.mutate({ userId: u.id, active: !u.active })
                            }
                          >
                            {u.active ? (
                              <>
                                <ShieldOff className="size-3.5" /> Deactivate
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="size-3.5" /> Reactivate
                              </>
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(data ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No accounts found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(target)} onOpenChange={(open) => (open ? null : setTarget(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {target?.email}. They can sign in with it immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-pass">New password</Label>
            <Input
              id="new-pass"
              type="text"
              value={password}
              minLength={8}
              autoComplete="off"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={resetMutation.isPending || password.length < 8}
              onClick={() =>
                target && resetMutation.mutate({ userId: target.id, password })
              }
            >
              {resetMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Update password"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
