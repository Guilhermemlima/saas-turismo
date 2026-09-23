import "server-only";

import type { TenantContext } from "@/server/auth/tenant";
import type { StageKey, Tables } from "@/server/db/database.types";
import type { SupabaseServerClient } from "@/server/db/server-client";

export type QuoteItem = Tables<"quote_items">;
export type QuoteOption = Tables<"quote_options"> & { items: QuoteItem[] };

export type QuoteDetail = Tables<"quotes"> & {
  customer: { id: string; full_name: string } | null;
  request: {
    id: string;
    destination: string | null;
    departure_date: string | null;
    return_date: string | null;
    travel_month: string | null;
    adults: number | null;
    children: number;
    infants: number;
    budget_cents: number | null;
    budget_currency: string;
  } | null;
  options: QuoteOption[];
};

export type QuoteListItem = Pick<Tables<"quotes">, "id" | "title" | "status" | "currency" | "updated_at" | "deal_id"> & {
  customer: { id: string; full_name: string } | null;
  options: { total_cents: number; margin_cents: number }[];
};

function raise(error: { message: string }): never {
  throw new Error(error.message);
}

export async function listQuotes(db: SupabaseServerClient, ctx: TenantContext, filters: { status: "draft" | "ready" | "archived" | "open"; dealId?: string }) {
  let request = db
    .from("quotes")
    .select(
      `id, title, status, currency, updated_at, deal_id,
       customer:customers!quotes_customer_fk ( id, full_name ),
       options:quote_options ( total_cents, margin_cents )`,
    )
    .eq("agency_id", ctx.agencyId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (filters.dealId) request = request.eq("deal_id", filters.dealId);
  request = filters.status === "open" ? request.in("status", ["draft", "ready"]) : request.eq("status", filters.status);

  const { data, error } = await request.overrideTypes<QuoteListItem[], { merge: false }>();
  if (error) raise(error);
  return data ?? [];
}

export async function getQuote(db: SupabaseServerClient, ctx: TenantContext, id: string) {
  const { data, error } = await db
    .from("quotes")
    .select(
      `*,
       customer:customers!quotes_customer_fk ( id, full_name ),
       request:travel_requests!quotes_travel_request_fk ( id, destination, departure_date, return_date, travel_month, adults, children, infants, budget_cents, budget_currency ),
       options:quote_options ( *, items:quote_items ( * ) )`,
    )
    .eq("agency_id", ctx.agencyId)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<QuoteDetail, { merge: false }>();
  if (error) raise(error);
  if (!data) return null;

  data.options.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  for (const option of data.options) option.items.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  return data;
}

/** Moves the deal to a pipeline stage by semantic key, only when it is currently in one of `fromKeys`. */
export async function advanceDealStage(db: SupabaseServerClient, ctx: TenantContext, dealId: string, toKey: StageKey, fromKeys: StageKey[]) {
  const { data: deal } = await db
    .from("deals")
    .select("id, pipeline_id, stage:pipeline_stages!deals_stage_fk ( system_key )")
    .eq("agency_id", ctx.agencyId)
    .eq("id", dealId)
    .maybeSingle()
    .overrideTypes<{ id: string; pipeline_id: string; stage: { system_key: StageKey | null } | null }, { merge: false }>();
  const current = deal?.stage?.system_key;
  if (!deal || !current || !fromKeys.includes(current)) return false;

  const { data: target } = await db
    .from("pipeline_stages")
    .select("id")
    .eq("agency_id", ctx.agencyId)
    .eq("pipeline_id", deal.pipeline_id)
    .eq("system_key", toKey)
    .is("archived_at", null)
    .maybeSingle();
  if (!target) return false;

  const { error } = await db.from("deals").update({ stage_id: target.id }).eq("agency_id", ctx.agencyId).eq("id", deal.id);
  if (error) raise(error);
  return true;
}

export async function createQuoteForRequest(db: SupabaseServerClient, ctx: TenantContext, requestId: string) {
  const { data: request, error } = await db
    .from("travel_requests")
    .select("id, deal_id, customer_id, destination, budget_currency, customer:customers!travel_requests_customer_fk ( full_name )")
    .eq("agency_id", ctx.agencyId)
    .eq("id", requestId)
    .maybeSingle()
    .overrideTypes<
      { id: string; deal_id: string; customer_id: string; destination: string | null; budget_currency: string; customer: { full_name: string } | null },
      { merge: false }
    >();
  if (error) raise(error);
  if (!request) return null;

  const title = `${request.destination ?? "Viagem"} · ${request.customer?.full_name ?? "Cliente"}`.slice(0, 160);
  const currency = ["BRL", "USD", "EUR"].includes(request.budget_currency) ? request.budget_currency : "BRL";
  const { data: quote, error: quoteError } = await db
    .from("quotes")
    .insert({
      agency_id: ctx.agencyId,
      deal_id: request.deal_id,
      customer_id: request.customer_id,
      travel_request_id: request.id,
      title,
      currency,
      assigned_member_id: ctx.memberId,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (quoteError) raise(quoteError);

  const { error: optionError } = await db
    .from("quote_options")
    .insert({ agency_id: ctx.agencyId, quote_id: quote.id, title: "Opção 1", position: 1 });
  if (optionError) raise(optionError);

  await advanceDealStage(db, ctx, request.deal_id, "quoting", ["new_contact", "qualifying", "request_complete"]);
  return quote.id;
}

/** A quote marked ready closes its "prepare quote" tasks and advances the deal. */
export async function onQuoteReady(db: SupabaseServerClient, ctx: TenantContext, quote: { id: string; deal_id: string }) {
  const { error } = await db
    .from("tasks")
    .update({ status: "done" })
    .eq("agency_id", ctx.agencyId)
    .eq("deal_id", quote.deal_id)
    .eq("task_type", "prepare_quote")
    .eq("status", "open");
  if (error) raise(error);
  return advanceDealStage(db, ctx, quote.deal_id, "quote_ready", ["new_contact", "qualifying", "request_complete", "quoting"]);
}
