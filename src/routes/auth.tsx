import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — MedFed Federated Health AI" },
      {
        name: "description",
        content:
          "Sign in or register your hospital to join the MedFed federated learning healthcare prediction network.",
      },
      { property: "og:title", content: "Sign in — MedFed Federated Health AI" },
      {
        property: "og:description",
        content: "Hospital and administrator access to the MedFed federated learning platform.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) void navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  const signIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    void navigate({ to: "/dashboard" });
  };

  const register = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const name = String(form.get("name"));
    const location = String(form.get("location"));
    setBusy(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password: String(form.get("password")),
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });

    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      const { error: hospErr } = await supabase
        .from("hospitals")
        .insert({ owner_id: userId, name, email, location, status: "pending" });
      if (hospErr) {
        setBusy(false);
        toast.error(`Account created, but hospital record failed: ${hospErr.message}`);
        return;
      }
    }

    setBusy(false);
    toast.success("Registration submitted — an administrator must approve your hospital.");
    if (data.session) void navigate({ to: "/dashboard" });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hero-gradient hidden flex-col justify-between p-12 text-primary-foreground lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <Activity className="size-6" />
          <span className="font-display text-lg font-semibold">MedFed</span>
        </Link>
        <div className="max-w-md">
          <h2 className="font-display text-3xl leading-tight font-semibold">
            Privacy-preserving disease prediction across hospitals.
          </h2>
          <p className="mt-4 text-sm opacity-80">
            Hospitals keep their data local. Only model updates are shared, aggregated into a global
            model, and recorded on a tamper-evident ledger.
          </p>
        </div>
        <p className="text-xs opacity-60">Demo platform — do not enter real patient information.</p>
      </div>

      <div className="flex items-center justify-center bg-background px-5 py-12">
        <Card className="w-full max-w-md shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle>Access the network</CardTitle>
            <CardDescription>
              Hospitals register for approval. The first account created becomes the platform
              administrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="register">Register hospital</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={signIn} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="si-email">Email</Label>
                    <Input id="si-email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="si-pass">Password</Label>
                    <Input
                      id="si-pass"
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={register} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="rg-name">Hospital name</Label>
                    <Input id="rg-name" name="name" required placeholder="St. Mary General" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rg-location">Location</Label>
                    <Input id="rg-location" name="location" required placeholder="Pune, India" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rg-email">Email</Label>
                    <Input id="rg-email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rg-pass">Password</Label>
                    <Input
                      id="rg-pass"
                      name="password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : "Submit registration"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
