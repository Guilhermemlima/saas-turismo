import "server-only";

import type { TenantContext } from "@/server/auth/tenant";
import type { AgencyRole } from "@/server/db/database.types";
import type { SupabaseServerClient } from "@/server/db/server-client";

export type MemberOption = { id: string; name: string; role: AgencyRole };

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
