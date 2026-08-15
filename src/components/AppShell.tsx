import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Blocks,
  Building2,
  Cpu,
  Database,
  History,
  LogOut,
  Settings,
  Stethoscope,
  UserCog,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3, roles: ["admin", "hospital"] },
  
  { to: "/patients", label: "Patients", icon: Users, roles: ["hospital"] },
  { to: "/datasets", label: "Datasets", icon: Database, roles: ["admin", "hospital"] },
  { to: "/predict", label: "Prediction", icon: Stethoscope, roles: ["admin", "hospital"] },
  { to: "/history", label: "History", icon: History, roles: ["admin", "hospital"] },
  { to: "/training", label: "Train Model", icon: Cpu, roles: ["admin"] },
  { to: "/hospitals", label: "Hospitals", icon: Building2, roles: ["admin"] },
  { to: "/accounts", label: "Accounts", icon: UserCog, roles: ["admin"] },
  { to: "/audit", label: "Audit Trail", icon: Blocks, roles: ["admin", "hospital"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["admin", "hospital"] },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { role, hospital, user, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = NAV.filter((n) => (role ? (n.roles as readonly string[]).includes(role) : false));

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 border-b border-sidebar-border px-5 py-5">
          <Activity className="size-5 text-sidebar-primary" />
          <div>
            <p className="font-display text-base leading-none font-semibold">MedFed</p>
            <p className="mt-1 text-[11px] tracking-wide text-sidebar-foreground/60 uppercase">
              Federated Health AI
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4 text-xs">
          <p className="truncate font-medium">{hospital?.name ?? user?.email}</p>
          <p className="mt-0.5 text-sidebar-foreground/60 capitalize">{role ?? "—"} account</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut()}
            className="mt-3 h-8 w-full justify-start gap-2 px-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-3.5" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-xs whitespace-nowrap text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-primary font-medium text-xs whitespace-nowrap" }}
            >
              {item.label}
            </Link>
          ))}
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
