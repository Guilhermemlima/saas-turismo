import "server-only";

import type { TenantContext } from "@/server/auth/tenant";
import type { StageKey, Tables } from "@/server/db/database.types";
import type { SupabaseServerClient } from "@/server/db/server-client";

import { parseThresholds, type TemperatureThresholds } from "./scoring";

export type PipelineStage = Pick<
  Tables<"pipeline_stages">,
  "id" | "name" | "position" | "color" | "system_key" | "is_won" | "is_lost" | "archived_at"
>;

export type BoardDeal = {
  id: string;
  title: string;
  stage_id: string;
  stage_entered_at: string;
  lead_score: number;
  expected_value_cents: number | null;
  currency: string;
  assigned_member_id: string | null;
  updated_at: string;
  customer: { id: string; full_name: string; last_contact_at: string | null } | null;
  assigned: { id: string; display_name: string | null; profile: { full_name: string } | null } | null;
  request:
    | {
        id: string;
        status: Tables<"travel_requests">["status"];
        destination: string | null;
        origin_city: string | null;
        date_flexibility: Tables<"travel_requests">["date_flexibility"];
        departure_date: string | null;
        return_date: string | null;
        travel_month: string | null;
        adults: number | null;
        children: number;
        infants: number;
        budget_cents: number | null;
        budget_currency: string;
        needs_flights: boolean;
        needs_hotel: boolean;
        needs_transfer: boolean;
        needs_insurance: boolean;
        needs_tours: boolean;
        hotel_category: number | null;
      }[]
    | null;
};

const BOARD_LIMIT = 500;

function raise(error: { message: string }): never {
  throw new Error(error.message);
}

export async function getDefaultPipeline(db: SupabaseServerClient, ctx: TenantContext) {
  const { data, error } = await db
    .from("pipelines")
    .select("id, name")
    .eq("agency_id", ctx.agencyId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) raise(error);
  return data;
}

export async function listStages(db: SupabaseServerClient, ctx: TenantContext, pipelineId: string, includeArchived = false) {
  let request = db
    .from("pipeline_stages")
    .select("id, name, position, color, system_key, is_won, is_lost, archived_at")
    .eq("agency_id", ctx.agencyId)
    .eq("pipeline_id", pipelineId)
    .order("position");
  if (!includeArchived) request = request.is("archived_at", null);
  const { data, error } = await request;
  if (error) raise(error);
  return (data ?? []) as PipelineStage[];
}

export async function listBoardDeals(
  db: SupabaseServerClient,
  ctx: TenantContext,
  pipelineId: string,
  filters: { mine: boolean; q: string },
) {
  let request = db
    .from("deals")
    .select(
      `id, title, stage_id, stage_entered_at, lead_score, expected_value_cents, currency, assigned_member_id, updated_at,
       customer:customers!deals_customer_fk ( id, full_name, last_contact_at ),
       assigned:agency_members!deals_assigned_member_fk ( id, display_name, profile:profiles ( full_name ) ),
       request:travel_requests!travel_requests_deal_fk (
         id, status, destination, origin_city, date_flexibility, departure_date, return_date, travel_month,
         adults, children, infants, budget_cents, budget_currency, needs_flights, needs_hotel, needs_transfer,
         needs_insurance, needs_tours, hotel_category
       )`,
    )
    .eq("agency_id", ctx.agencyId)
    .eq("pipeline_id", pipelineId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(BOARD_LIMIT);

  if (filters.mine) request = request.eq("assigned_member_id", ctx.memberId);
  if (filters.q) {
    const term = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()"]/g, " ")}%`;
    request = request.ilike("title", term);
  }

  const { data, error } = await request.overrideTypes<BoardDeal[], { merge: false }>();
  if (error) raise(error);
  return { deals: data ?? [], truncated: (data?.length ?? 0) >= BOARD_LIMIT };
}

export async function getTemperatureThresholds(db: SupabaseServerClient, ctx: TenantContext): Promise<TemperatureThresholds> {
  const { data } = await db.from("agency_settings").select("temperature_thresholds").eq("agency_id", ctx.agencyId).maybeSingle();
  return parseThresholds(data?.temperature_thresholds);
}

/** Moves a deal; the target stage must be an active stage of the deal's own pipeline. */
export async function moveDealToStage(db: SupabaseServerClient, ctx: TenantContext, dealId: string, stageId: string) {
  const { data: deal, error: dealError } = await db
    .from("deals")
    .select("id, pipeline_id, stage_id")
    .eq("agency_id", ctx.agencyId)
    .eq("id", dealId)
    .maybeSingle();
  if (dealError) raise(dealError);
  if (!deal) return { ok: false as const, reason: "not_found" as const };
  if (deal.stage_id === stageId) return { ok: true as const, stage: null };

  const { data: stage, error: stageError } = await db
    .from("pipeline_stages")
    .select("id, name, system_key")
    .eq("agency_id", ctx.agencyId)
    .eq("pipeline_id", deal.pipeline_id)
    .eq("id", stageId)
    .is("archived_at", null)
    .maybeSingle();
  if (stageError) raise(stageError);
  if (!stage) return { ok: false as const, reason: "invalid_stage" as const };

  const { error } = await db.from("deals").update({ stage_id: stage.id }).eq("agency_id", ctx.agencyId).eq("id", deal.id);
  if (error) raise(error);
  return { ok: true as const, stage: stage as { id: string; name: string; system_key: StageKey | null } };
}
