import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "hospital";

export type Hospital = {
  id: string;
  name: string;
  email: string;
  location: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: Role | null;
  hospital: Hospital | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string | undefined) => {
    if (!userId) {
      setRole(null);
      setHospital(null);
      return;
    }
    const [{ data: roles }, { data: hosp }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("hospitals").select("*").eq("owner_id", userId).maybeSingle(),
    ]);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    setRole(isAdmin ? "admin" : (roles ?? []).length ? "hospital" : null);
    setHospital((hosp as Hospital | null) ?? null);
  };

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSession(next);
      setTimeout(() => void loadProfile(next?.user?.id), 0);
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user?.id);
      setLoading(false);
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      role,
      hospital,
      refresh: () => loadProfile(session?.user?.id),
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setRole(null);
        setHospital(null);
      },
    }),
    [loading, session, role, hospital],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
