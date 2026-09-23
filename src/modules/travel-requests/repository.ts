import "server-only";

import type { TenantContext } from "@/server/auth/tenant";
import type { StageKey, Tables } from "@/server/db/database.types";
import type { SupabaseServerClient } from "@/server/db/server-client";

import { scoreLead } from "@/modules/deals/scoring";

import { isRequestComplete } from "./completeness";
import { PRE_QUALIFICATION_STAGES } from "./labels";
import { REQUESTS_PAGE_SIZE, type RequestListQuery, type TravelRequestInput } from "./schemas";

export type TravelRequest = Tables<"travel_requests">;

type StageRef = { id: string; name: string; color: string; system_key: StageKey | null };
type MemberRef = { id: string; display_name: string | null; profile: { full_name: string } | null };

export type TravelRequestWithRelations = TravelRequest & {
  customer: { id: string; full_name: string; phone_e164: string | null; email: string | null } | null;
  deal: {
    id: string;
    title: string;
    pipeline_id: string;
    assigned_member_id: string | null;
    stage: StageRef | null;
    assigned: MemberRef | null;
  } | null;
};

const RELATIONS = `
  customer:customers!travel_requests_customer_fk ( id, full_name, phone_e164, email ),
  deal:deals!travel_requests_deal_fk (
    id, title, pipeline_id, assigned_member_id,
    stage:pipeline_stages!deals_stage_fk ( id, name, color, system_key ),
    assigned:agency_members!deals_assigned_member_fk ( id, display_name, profile:profiles ( full_name ) )
  )`;

function raise(error: { message: string }): never {
  throw new Error(error.message);
}

/** Splits the validated form into the request row and the deal-level fields. */
function toRequestColumns(input: TravelRequestInput) {
  const { assigned_member_id: _assigned, ...request } = input;
  return { ...request, status: isRequestComplete(request) ? ("complete" as const) : ("collecting" as const) };
}

export function dealTitle(input: Pick<TravelRequestInput, "destination">, customerName: string): string {
  const title = input.destination ? `${input.destination} · ${customerName}` : `Nova viagem · ${customerName}`;
  return title.slice(0, 120);
}

export async function listTravelRequests(db: SupabaseServerClient, ctx: TenantContext, query: RequestListQuery) {
  const from = (query.page - 1) * REQUESTS_PAGE_SIZE;
  let request = db
    .from("travel_requests")
    .select(`*, ${RELATIONS}`, { count: "exact" })
    .eq("agency_id", ctx.agencyId)
    .order("updated_at", { ascending: false })
    .range(from, from + REQUESTS_PAGE_SIZE - 1);

  if (query.status === "open") request = request.in("status", ["collecting", "complete"]);
  else if (query.status !== "all") request = request.eq("status", query.status);

  if (query.q) {
    const term = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()"]/g, " ")}%`;
    request = request.or(`destination.ilike.${term},origin_city.ilike.${term}`);
  }

  const { data, error, count } = await request.overrideTypes<TravelRequestWithRelations[], { merge: false }>();
  if (error) raise(error);
  return { items: data ?? [], total: count ?? 0 };
}

export async function listCustomerTravelRequests(db: SupabaseServerClient, ctx: TenantContext, customerId: string) {
  const { data, error } = await db
    .from("travel_requests")
    .select(`*, ${RELATIONS}`)
    .eq("agency_id", ctx.agencyId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .overrideTypes<TravelRequestWithRelations[], { merge: false }>();
  if (error) raise(error);
  return data ?? [];
}

export async function getTravelRequest(db: SupabaseServerClient, ctx: TenantContext, id: string) {
  const { data, error } = await db
    .from("travel_requests")
    .select(`*, ${RELATIONS}`)
    .eq("agency_id", ctx.agencyId)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<TravelRequestWithRelations, { merge: false }>();
  if (error) raise(error);
  return data;
}

export async function countOpenTravelRequests(db: SupabaseServerClient, ctx: TenantContext) {
  const { count, error } = await db
    .from("travel_requests")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", ctx.agencyId)
    .in("status", ["collecting", "complete"]);
  if (error) raise(error);
  return count ?? 0;
}

export async function listCustomerOptions(db: SupabaseServerClient, ctx: TenantContext) {
  const { data, error } = await db
    .from("customers")
    .select("id, full_name, phone_e164")
    .eq("agency_id", ctx.agencyId)
    .is("archived_at", null)
    .is("anonymized_at", null)
    .order("full_name")
    .limit(1000);
  if (error) raise(error);
  return data ?? [];
}

/** Creates deal + request atomically (RPC). Stage depends on whether the request is already complete. */
export async function createTravelRequest(
  db: SupabaseServerClient,
  ctx: TenantContext,
  customer: { id: string; full_name: string },
  input: TravelRequestInput,
) {
  const columns = toRequestColumns(input);
  const { data, error } = await db
    .rpc("create_travel_request", {
      p_customer_id: customer.id,
      p_title: dealTitle(input, customer.full_name),
      p_stage_key: columns.status === "complete" ? "request_complete" : "qualifying",
      p_assigned_member_id: input.assigned_member_id ?? ctx.memberId,
      p_request: columns,
    })
    .single();
  if (error) raise(error);

  const { error: scoreError } = await db
    .from("deals")
    .update({ lead_score: scoreLead(columns).total })
    .eq("agency_id", ctx.agencyId)
    .eq("id", data.deal_id);
  if (scoreError) raise(scoreError);
  return data;
}

/**
 * Updates the request and its deal. When the request becomes complete while the deal is still in
 * an early stage, the deal advances to "Solicitação completa" — a deterministic rule, never an AI call.
 */
export async function updateTravelRequest(
  db: SupabaseServerClient,
  ctx: TenantContext,
  current: TravelRequestWithRelations,
  input: TravelRequestInput,
) {
  const columns = toRequestColumns(input);

  const { error } = await db.from("travel_requests").update(columns).eq("agency_id", ctx.agencyId).eq("id", current.id);
  if (error) raise(error);

  const dealUpdate: { title: string; assigned_member_id: string | null; lead_score: number; stage_id?: string } = {
    title: dealTitle(input, current.customer?.full_name ?? "Cliente"),
    assigned_member_id: input.assigned_member_id,
    lead_score: scoreLead(columns).total,
  };

  const stageKey = current.deal?.stage?.system_key;
  if (columns.status === "complete" && stageKey && PRE_QUALIFICATION_STAGES.includes(stageKey)) {
    const { data: stage, error: stageError } = await db
      .from("pipeline_stages")
      .select("id")
      .eq("agency_id", ctx.agencyId)
      .eq("pipeline_id", current.deal?.pipeline_id ?? "")
      .eq("system_key", "request_complete")
      .maybeSingle();
    if (stageError) raise(stageError);
    if (stage) dealUpdate.stage_id = stage.id;
  }

  const { error: dealError } = await db
    .from("deals")
    .update(dealUpdate)
    .eq("agency_id", ctx.agencyId)
    .eq("id", current.deal_id);
  if (dealError) raise(dealError);

  return { status: columns.status, advancedStage: Boolean(dealUpdate.stage_id) };
}

export async function setTravelRequestStatus(
  db: SupabaseServerClient,
  ctx: TenantContext,
  request: TravelRequest,
  status: "archived" | "reopen",
) {
  const next = status === "archived" ? "archived" : isRequestComplete(request) ? "complete" : "collecting";
  const { error } = await db.from("travel_requests").update({ status: next }).eq("agency_id", ctx.agencyId).eq("id", request.id);
  if (error) raise(error);
  return next;
}
