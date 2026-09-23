import "server-only";

import type { TenantContext } from "@/server/auth/tenant";
import type { AgencyRole, MemberStatus } from "@/server/db/database.types";
import type { SupabaseServerClient } from "@/server/db/server-client";

export type MemberOption = { id: string; name: string; role: AgencyRole };

export type TeamMember = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  role: AgencyRole;
  status: MemberStatus;
  createdAt: string;
};

export type PendingInvitation = { id: string; email: string; role: AgencyRole; expiresAt: string; createdAt: string };

export async function listActiveMembers(db: SupabaseServerClient, ctx: TenantContext): Promise<MemberOption[]> {
  const { data, error } = await db
    .from("agency_members")
    .select("id, role, display_name, profile:profiles ( full_name )")
    .eq("agency_id", ctx.agencyId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    name: m.display_name || m.profile?.full_name || "Sem nome",
  }));
}

export async function listTeam(db: SupabaseServerClient, ctx: TenantContext): Promise<TeamMember[]> {
  const { data, error } = await db
    .from("agency_members")
    .select("id, user_id, role, status, display_name, created_at, profile:profiles ( full_name, email )")
    .eq("agency_id", ctx.agencyId)
    .neq("status", "invited")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    name: m.display_name || m.profile?.full_name || "Sem nome",
    email: m.profile?.email ?? null,
    role: m.role,
    status: m.status,
    createdAt: m.created_at,
  }));
}

export async function listPendingInvitations(db: SupabaseServerClient, ctx: TenantContext): Promise<PendingInvitation[]> {
  const { data, error } = await db
    .from("agency_invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("agency_id", ctx.agencyId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at, createdAt: i.created_at }));
}
