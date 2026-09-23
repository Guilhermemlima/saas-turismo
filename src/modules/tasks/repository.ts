import "server-only";

import type { TenantContext } from "@/server/auth/tenant";
import type { Tables } from "@/server/db/database.types";
import type { SupabaseServerClient } from "@/server/db/server-client";

export type TaskListItem = Pick<
  Tables<"tasks">,
  "id" | "title" | "description" | "task_type" | "status" | "priority" | "due_at" | "assigned_member_id" | "customer_id" | "deal_id" | "completed_at" | "created_at"
> & {
  customer: { id: string; full_name: string } | null;
  assigned: { id: string; display_name: string | null; profile: { full_name: string } | null } | null;
};

const COLUMNS = `id, title, description, task_type, status, priority, due_at, assigned_member_id, customer_id, deal_id, completed_at, created_at,
  customer:customers!tasks_customer_fk ( id, full_name ),
  assigned:agency_members!tasks_assigned_member_fk ( id, display_name, profile:profiles ( full_name ) )`;

function raise(error: { message: string }): never {
  throw new Error(error.message);
}

export async function listTasks(
  db: SupabaseServerClient,
  ctx: TenantContext,
  filters: { view: "mine" | "all" | "overdue" | "done"; customerId?: string; limit?: number },
) {
  let request = db.from("tasks").select(COLUMNS).eq("agency_id", ctx.agencyId).limit(filters.limit ?? 200);

  if (filters.customerId) request = request.eq("customer_id", filters.customerId);
  if (filters.view === "done") {
    request = request.eq("status", "done").order("completed_at", { ascending: false });
  } else {
    request = request.eq("status", "open").order("due_at", { ascending: true, nullsFirst: false }).order("created_at");
    if (filters.view === "mine") request = request.eq("assigned_member_id", ctx.memberId);
    if (filters.view === "overdue") request = request.lt("due_at", new Date().toISOString());
  }

  const { data, error } = await request.overrideTypes<TaskListItem[], { merge: false }>();
  if (error) raise(error);
  return data ?? [];
}

export async function countMyOpenTasks(db: SupabaseServerClient, ctx: TenantContext) {
  const { count, error } = await db
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", ctx.agencyId)
    .eq("assigned_member_id", ctx.memberId)
    .eq("status", "open");
  if (error) raise(error);
  return count ?? 0;
}

/**
 * Deterministic rule: a complete travel request needs a quote. Idempotent thanks to the unique
 * index "one open prepare_quote task per deal" (a duplicate insert is simply ignored).
 */
export async function ensurePrepareQuoteTask(
  db: SupabaseServerClient,
  ctx: TenantContext,
  deal: { id: string; customerId: string; assignedMemberId: string | null; destination: string | null },
) {
  const { error } = await db.from("tasks").insert({
    agency_id: ctx.agencyId,
    title: `Preparar cotação${deal.destination ? ` · ${deal.destination}` : ""}`.slice(0, 160),
    description: "Criada automaticamente: a solicitação de viagem ficou completa.",
    task_type: "prepare_quote",
    priority: "high",
    assigned_member_id: deal.assignedMemberId,
    customer_id: deal.customerId,
    deal_id: deal.id,
    due_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    created_by: ctx.userId,
  });
  if (error && error.code !== "23505") raise(error);
}
