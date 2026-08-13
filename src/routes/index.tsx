import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Blocks, Brain, ShieldCheck, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MedFed — Federated Learning Healthcare Prediction" },
      {
        name: "description",
        content:
          "A federated learning platform where hospitals train a shared disease-risk model without sharing patient data, with SHAP explanations and a blockchain audit trail.",
      },
      { property: "og:title", content: "MedFed — Federated Learning Healthcare Prediction" },
      {
        property: "og:description",
        content:
          "Collaborative disease-risk prediction across hospitals with explainable AI and a tamper-evident model ledger.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Brain,
    title: "Federated training",
    body: "Each hospital trains locally; only model updates are aggregated into a global model.",
  },
  {
    icon: Stethoscope,
    title: "Risk prediction",
    body: "Submit clinical feature values and get a colour-coded risk level with a recommended action.",
  },
  {
    icon: ShieldCheck,
    title: "Explainable results",
    body: "SHAP contributions show which factors push risk up or down, in plain language.",
  },
  {
    icon: Blocks,
    title: "Blockchain ledger",
    body: "Every training round is hashed into a chain you can verify block by block.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <span className="font-display text-lg font-semibold">MedFed</span>
        </div>
        <Button asChild size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <section className="surface-grid border-y border-border">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <p className="mb-4 inline-block rounded-full border border-border bg-card px-3 py-1 text-xs tracking-wide text-muted-foreground uppercase">
            Privacy-preserving healthcare AI
          </p>
          <h1 className="font-display text-4xl leading-tight font-semibold text-balance sm:text-5xl">
            Hospitals collaborate on one model. Patient data never leaves the building.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">
            MedFed is the dashboard layer for a federated learning network: trigger global training
            rounds, run explainable disease-risk predictions, and verify the model ledger.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Register your hospital</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">Administrator sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <Card key={f.title} className="shadow-[var(--shadow-card)]">
            <CardContent className="p-6">
              <f.icon className="size-5 text-primary" />
              <h3 className="mt-4 font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">
        Demo research platform — do not enter real patient information.
      </footer>
    </div>
  );
}
