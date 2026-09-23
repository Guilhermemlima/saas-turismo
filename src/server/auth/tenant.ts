import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/env";
import { ForbiddenError, permissionsFor, roleCan, type Permission } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/server/db/server-client";
import type { AgencyRole, AgencyStatus } from "@/server/db/database.types";

export const ACTIVE_AGENCY_COOKIE = "active_agency";

export type Membership = {
  memberId: string;
  agencyId: string;
  agencyName: string;
  agencyStatus: AgencyStatus;
  agencyLogoPath: string | null;
  role: AgencyRole;
};

export type TenantContext = {
  userId: string;
  email: string;
  fullName: string;
  memberId: string;
  agencyId: string;
  agencyName: string;
  agencyStatus: AgencyStatus;
  role: AgencyRole;
  permissions: ReadonlySet<Permission>;
  memberships: Membership[];
};

/** Authenticated user validated against Supabase Auth (not just a decoded cookie). */
export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

export const getMemberships = cache(async (userId: string): Promise<Membership[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agency_members")
    .select("id, role, agency_id, agencies ( name, status, logo_path )")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Falha ao carregar vínculos: ${error.message}`);

  return (data ?? []).flatMap((row) =>
    row.agencies
      ? [
          {
            memberId: row.id,
            agencyId: row.agency_id,
            agencyName: row.agencies.name,
            agencyStatus: row.agencies.status,
            agencyLogoPath: row.agencies.logo_path,
            role: row.role,
          },
        ]
      : [],
  );
});

/**
 * Resolves the tenant from the user's memberships. The active-agency cookie is only a
 * preference: it is honoured solely when it matches one of the user's memberships.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const memberships = await getMemberships(user.id);
  if (memberships.length === 0) return null;

  const preferred = (await cookies()).get(ACTIVE_AGENCY_COOKIE)?.value;
  const active = memberships.find((m) => m.agencyId === preferred) ?? memberships[0];

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name || user.email || "Usuário",
    memberId: active.memberId,
    agencyId: active.agencyId,
    agencyName: active.agencyName,
    agencyStatus: active.agencyStatus,
    role: active.role,
    permissions: permissionsFor(active.role),
    memberships,
  };
});

/** For pages: redirects instead of throwing. */
export async function requireTenant(): Promise<TenantContext> {
  await cookies(); // dynamic rendering: tenant pages depend on the session
  if (!isSupabaseConfigured()) redirect("/setup");

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ctx = await getTenantContext();
  if (!ctx) redirect("/onboarding");
  if (ctx.agencyStatus === "suspended" || ctx.agencyStatus === "cancelled") redirect("/suspended");
  return ctx;
}

export function can(ctx: TenantContext, permission: Permission): boolean {
  return roleCan(ctx.role, permission);
}

/** For Server Actions and route handlers. */
export function requirePermission(ctx: TenantContext, permission: Permission): void {
  if (!can(ctx, permission)) throw new ForbiddenError(permission);
}
