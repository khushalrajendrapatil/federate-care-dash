import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string | undefined;
  icon: LucideIcon;
}) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
          <Icon className="size-4 text-primary" />
        </div>
        <p className="mt-3 font-display text-3xl font-semibold">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
