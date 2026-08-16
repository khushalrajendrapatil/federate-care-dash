/**
 * Admin-only account management server functions.
 * Every handler re-verifies the caller's admin role before touching the
 * privileged auth admin client.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ManagedUser = {
  id: string;
  email: string;
  role: "admin" | "hospital" | null;
  hospitalName: string | null;
  hospitalStatus: "pending" | "approved" | "rejected" | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  active: boolean;
};

async function adminContext(supabase: any, userId: string, email?: string | null) {
  const { resolveActor, requireAdmin } = await import("@/lib/fl.server");
  const actor = await resolveActor(supabase, userId, email);
  requireAdmin(actor);
  return actor;
}

export const listManagedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    await adminContext(context.supabase, context.userId, context.claims?.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw new Error(`Could not load accounts: ${error.message}`);

    const [{ data: roles }, { data: hospitals }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id,role"),
      supabaseAdmin.from("hospitals").select("owner_id,name,status"),
    ]);

    const roleBy = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    const hospBy = new Map((hospitals ?? []).map((h) => [h.owner_id, h]));

    return list.users.map((u) => {
      const hosp = hospBy.get(u.id);
      const bannedUntil = (u as { banned_until?: string | null }).banned_until ?? null;
      return {
        id: u.id,
        email: u.email ?? "—",
        role: (roleBy.get(u.id) as ManagedUser["role"]) ?? null,
        hospitalName: hosp?.name ?? null,
        hospitalStatus: (hosp?.status as ManagedUser["hospitalStatus"]) ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        emailConfirmed: Boolean(u.email_confirmed_at),
        active: !bannedUntil || new Date(bannedUntil).getTime() <= Date.now(),
      };
    });
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string; password: string }) => {
    if (!input?.userId) throw new Error("A user id is required.");
    const password = String(input.password ?? "");
    if (password.length < 8) throw new Error("The new password must be at least 8 characters.");
    return { userId: String(input.userId), password };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const actor = await adminContext(context.supabase, context.userId, context.claims?.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordAudit, notify } = await import("@/lib/fl.server");

    const { data: updated, error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(`Could not reset the password: ${error.message}`);

    await recordAudit({
      client: context.supabase,
      eventType: "account.password_reset",
      actorId: actor.userId,
      actorLabel: actor.label,
      payload: { target: updated.user?.email ?? data.userId },
    });
    await notify(
      context.supabase,
      data.userId,
      "Password changed",
      "An administrator set a new password for your account.",
      "warning",
    );
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string; active: boolean }) => {
    if (!input?.userId) throw new Error("A user id is required.");
    return { userId: String(input.userId), active: Boolean(input.active) };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const actor = await adminContext(context.supabase, context.userId, context.claims?.email);
    if (data.userId === actor.userId && !data.active) {
      throw new Error("You cannot deactivate your own administrator account.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordAudit } = await import("@/lib/fl.server");

    const { data: updated, error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error) throw new Error(`Could not update the account: ${error.message}`);

    await recordAudit({
      client: context.supabase,
      eventType: data.active ? "account.reactivated" : "account.deactivated",
      actorId: actor.userId,
      actorLabel: actor.label,
      payload: { target: updated.user?.email ?? data.userId },
    });
    return { ok: true };
  });
