import "server-only";

import type { TenantContext } from "@/server/auth/tenant";
import type { Json, StageKey, Tables } from "@/server/db/database.types";
import type { SupabaseServerClient } from "@/server/db/server-client";

import { QUOTES_PAGE_SIZE, type ItemInput, type OptionInput, type QuoteListQuery, type QuoteUpdateInput } from "./schemas";

export type Quote = Tables<"quotes">;
export type QuoteOption = Tables<"quote_options">;
export type QuoteItem = Tables<"quote_items">;

export type QuoteOptionWithItems = QuoteOption & { items: QuoteItem[] };

type StageRef = { id: string; name: string; color: string; system_key: StageKey | null };

export type QuoteDetail = Quote & {
  customer: { id: string; full_name: string; phone_e164: string | null } | null;
  deal: { id: string; title: string; stage: StageRef | null } | null;
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
    budget_scope: "total" | "per_person" | null;
  } | null;
  options: QuoteOptionWithItems[];
};

export type QuoteListItem = Quote & {
  customer: { id: string; full_name: string } | null;
  request: { id: string; destination: string | null } | null;
  assigned: { id: string; display_name: string | null; profile: { full_name: string } | null } | null;
  options: { total_cents: number; items_count: number }[];
};

function raise(error: { message: string; code?: string }): never {
  throw Object.assign(new Error(error.message), { code: error.code });
}

export async function listQuotes(db: SupabaseServerClient, ctx: TenantContext, query: QuoteListQuery) {
  const from = (query.page - 1) * QUOTES_PAGE_SIZE;
  let request = db
    .from("quotes")
    .select(
      `*,
      customer:customers!quotes_customer_fk ( id, full_name ),
      request:travel_requests!quotes_travel_request_fk ( id, destination ),
      assigned:agency_members!quotes_assigned_member_fk ( id, display_name, profile:profiles ( full_name ) ),
      options:quote_options!quote_options_quote_fk ( total_cents, items_count )`,
      { count: "exact" },
    )
    .eq("agency_id", ctx.agencyId)
    .order("updated_at", { ascending: false })
    .range(from, from + QUOTES_PAGE_SIZE - 1);

  if (query.status !== "all") request = request.eq("status", query.status);
  if (query.q) {
    const term = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    request = request.ilike("title", term);
  }

  const { data, error, count } = await request.overrideTypes<QuoteListItem[], { merge: false }>();
  if (error) raise(error);
  return { items: data ?? [], total: count ?? 0 };
}

export async function getQuote(db: SupabaseServerClient, ctx: TenantContext, id: string): Promise<QuoteDetail | null> {
  const { data, error } = await db
    .from("quotes")
    .select(
      `*,
      customer:customers!quotes_customer_fk ( id, full_name, phone_e164 ),
      deal:deals!quotes_deal_fk ( id, title, stage:pipeline_stages!deals_stage_fk ( id, name, color, system_key ) ),
      request:travel_requests!quotes_travel_request_fk (
        id, destination, departure_date, return_date, travel_month, adults, children, infants, budget_cents, budget_currency, budget_scope
      ),
      options:quote_options!quote_options_quote_fk ( *, items:quote_items!quote_items_option_fk ( * ) )`,
    )
    .eq("agency_id", ctx.agencyId)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<QuoteDetail, { merge: false }>();
  if (error) raise(error);
  if (!data) return null;

  const byPosition = <T extends { position: number; created_at: string }>(a: T, b: T) =>
    a.position - b.position || a.created_at.localeCompare(b.created_at);
  return {
    ...data,
    options: [...data.options].sort(byPosition).map((option) => ({ ...option, items: [...option.items].sort(byPosition) })),
  };
}

export async function listDealQuotes(db: SupabaseServerClient, ctx: TenantContext, dealId: string) {
  const { data, error } = await db
    .from("quotes")
    .select("id, title, status, currency, updated_at, options:quote_options!quote_options_quote_fk ( total_cents, items_count )")
    .eq("agency_id", ctx.agencyId)
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  if (error) raise(error);
  return data ?? [];
}

/** Open deals (not won, lost or archived) that can receive a quote. */
export async function listQuotableDeals(db: SupabaseServerClient, ctx: TenantContext) {
  const { data, error } = await db
    .from("deals")
    .select("id, title, customer:customers!deals_customer_fk ( full_name )")
    .eq("agency_id", ctx.agencyId)
    .is("archived_at", null)
    .is("won_at", null)
    .is("lost_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) raise(error);
  return data ?? [];
}

export async function getDealForQuote(db: SupabaseServerClient, ctx: TenantContext, dealId: string) {
  const { data, error } = await db
    .from("deals")
    .select("id, title, assigned_member_id, archived_at, customer:customers!deals_customer_fk ( id, full_name )")
    .eq("agency_id", ctx.agencyId)
    .eq("id", dealId)
    .maybeSingle();
  if (error) raise(error);
  return data;
}

/** Creates the quote with a first empty option, ready for items. */
export async function createQuote(
  db: SupabaseServerClient,
  ctx: TenantContext,
  deal: { id: string; customerId: string; assignedMemberId: string | null },
  input: { title: string; currency: string },
) {
  const { data, error } = await db
    .from("quotes")
    .insert({
      agency_id: ctx.agencyId,
      deal_id: deal.id,
      customer_id: deal.customerId, // overwritten by the database from the deal
      title: input.title,
      currency: input.currency,
      assigned_member_id: deal.assignedMemberId ?? ctx.memberId,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) raise(error);

  const { error: optionError } = await db
    .from("quote_options")
    .insert({ agency_id: ctx.agencyId, quote_id: data.id, title: "Opção 1", position: 0 });
  if (optionError) raise(optionError);
  return data.id;
}

export async function updateQuote(db: SupabaseServerClient, ctx: TenantContext, quoteId: string, input: QuoteUpdateInput) {
  const { error } = await db.from("quotes").update(input).eq("agency_id", ctx.agencyId).eq("id", quoteId);
  if (error) raise(error);
}

export async function setQuoteStatus(db: SupabaseServerClient, ctx: TenantContext, quoteId: string, status: Quote["status"]) {
  const { error } = await db.from("quotes").update({ status }).eq("agency_id", ctx.agencyId).eq("id", quoteId);
  if (error) raise(error);
}

export async function getOption(db: SupabaseServerClient, ctx: TenantContext, optionId: string) {
  const { data, error } = await db
    .from("quote_options")
    .select("*, items:quote_items!quote_items_option_fk ( * )")
    .eq("agency_id", ctx.agencyId)
    .eq("id", optionId)
    .maybeSingle()
    .overrideTypes<QuoteOptionWithItems, { merge: false }>();
  if (error) raise(error);
  return data;
}

async function nextOptionPosition(db: SupabaseServerClient, ctx: TenantContext, quoteId: string) {
  const { data, error } = await db
    .from("quote_options")
    .select("position")
    .eq("agency_id", ctx.agencyId)
    .eq("quote_id", quoteId)
    .order("position", { ascending: false })
    .limit(1);
  if (error) raise(error);
  return (data?.[0]?.position ?? -1) + 1;
}

export async function addOption(db: SupabaseServerClient, ctx: TenantContext, quoteId: string) {
  const position = await nextOptionPosition(db, ctx, quoteId);
  const { data, error } = await db
    .from("quote_options")
    .insert({ agency_id: ctx.agencyId, quote_id: quoteId, title: `Opção ${position + 1}`, position })
    .select("id")
    .single();
  if (error) raise(error);
  return data.id;
}

/** Copies an option with all of its items (fee and discount applied once the items exist). */
export async function duplicateOption(db: SupabaseServerClient, ctx: TenantContext, source: QuoteOptionWithItems) {
  const position = await nextOptionPosition(db, ctx, source.quote_id);
  const { data, error } = await db
    .from("quote_options")
    .insert({
      agency_id: ctx.agencyId,
      quote_id: source.quote_id,
      title: `${source.title} (cópia)`.slice(0, 120),
      description: source.description,
      service_fee_cents: source.service_fee_cents,
      position,
    })
    .select("id")
    .single();
  if (error) raise(error);

  if (source.items.length > 0) {
    const { error: itemsError } = await db.from("quote_items").insert(
      source.items.map((item) => ({
        agency_id: ctx.agencyId,
        quote_option_id: data.id,
        item_type: item.item_type,
        position: item.position,
        title: item.title,
        description: item.description,
        supplier_name: item.supplier_name,
        start_date: item.start_date,
        end_date: item.end_date,
        quantity: item.quantity,
        cost_cents: item.cost_cents,
        markup_cents: item.markup_cents,
        pass_through_fees_cents: item.pass_through_fees_cents,
        commission_cents: item.commission_cents,
        show_price_to_customer: item.show_price_to_customer,
        details: item.details,
      })),
    );
    if (itemsError) raise(itemsError);
  }
  if (source.discount_cents > 0) {
    const { error: discountError } = await db
      .from("quote_options")
      .update({ discount_cents: source.discount_cents })
      .eq("agency_id", ctx.agencyId)
      .eq("id", data.id);
    if (discountError) raise(discountError);
  }
  return data.id;
}

export async function updateOption(db: SupabaseServerClient, ctx: TenantContext, optionId: string, input: OptionInput) {
  const { error } = await db.from("quote_options").update(input).eq("agency_id", ctx.agencyId).eq("id", optionId);
  if (error) raise(error);
}

export async function deleteOption(db: SupabaseServerClient, ctx: TenantContext, optionId: string) {
  const { error } = await db.from("quote_options").delete().eq("agency_id", ctx.agencyId).eq("id", optionId);
  if (error) raise(error);
}

export async function getItem(db: SupabaseServerClient, ctx: TenantContext, itemId: string) {
  const { data, error } = await db
    .from("quote_items")
    .select("id, quote_option_id, option:quote_options!quote_items_option_fk ( quote_id )")
    .eq("agency_id", ctx.agencyId)
    .eq("id", itemId)
    .maybeSingle()
    .overrideTypes<{ id: string; quote_option_id: string; option: { quote_id: string } | null }, { merge: false }>();
  if (error) raise(error);
  return data;
}

export async function saveItem(
  db: SupabaseServerClient,
  ctx: TenantContext,
  target: { optionId: string; itemId: string | null; position: number },
  input: ItemInput,
) {
  const columns = { ...input, details: input.details as Json };
  if (target.itemId) {
    const { error } = await db.from("quote_items").update(columns).eq("agency_id", ctx.agencyId).eq("id", target.itemId);
    if (error) raise(error);
    return;
  }
  const { error } = await db
    .from("quote_items")
    .insert({ ...columns, agency_id: ctx.agencyId, quote_option_id: target.optionId, position: target.position });
  if (error) raise(error);
}

export async function deleteItem(db: SupabaseServerClient, ctx: TenantContext, itemId: string) {
  const { error } = await db.from("quote_items").delete().eq("agency_id", ctx.agencyId).eq("id", itemId);
  if (error) raise(error);
}
