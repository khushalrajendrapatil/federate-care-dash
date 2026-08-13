import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, ShieldX } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading, role, hospital, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading your workspace…
      </div>
    );
  }

  if (role === "hospital" && hospital?.status !== "approved") {
    const rejected = hospital?.status === "rejected";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md">
          <CardContent className="space-y-4 p-8 text-center">
            {rejected ? (
              <ShieldX className="mx-auto size-10 text-destructive" />
            ) : (
              <Clock className="mx-auto size-10 text-warning" />
            )}
            <h1 className="text-xl font-semibold">
              {rejected ? "Registration rejected" : "Awaiting admin approval"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {rejected
                ? "Your hospital registration was rejected. Please contact the platform administrator."
                : hospital
                  ? `${hospital.name} is pending approval. An administrator must approve your hospital before you can access the platform.`
                  : "No hospital record is linked to this account yet."}
            </p>
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
