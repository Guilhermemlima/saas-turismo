import "server-only";

import type { TenantContext } from "@/server/auth/tenant";
import type { SupabaseServerClient } from "@/server/db/server-client";
import type { Tables } from "@/server/db/database.types";

import { CUSTOMERS_PAGE_SIZE, type CustomerInput, type CustomerListQuery } from "./schemas";

export type Customer = Tables<"customers">;

export type CustomerListItem = Pick<
  Customer,
  "id" | "full_name" | "phone_e164" | "email" | "city" | "state" | "source" | "last_contact_at" | "created_at" | "archived_at"
> & { owner: { id: string; display_name: string | null; profile: { full_name: string } | null } | null };

const LIST_COLUMNS =
  "id, full_name, phone_e164, email, city, state, source, last_contact_at, created_at, archived_at, owner:agency_members ( id, display_name, profile:profiles ( full_name ) )";

/** Escapes characters that have meaning inside a PostgREST `or=(...ilike...)` filter. */
function toIlikePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()"]/g, " ")}%`;
}

export class DuplicatePhoneError extends Error {
  constructor() {
    super("Já existe um cliente com este telefone nesta agência.");
    this.name = "DuplicatePhoneError";
  }
}

function raise(error: { code?: string; message: string }): never {
  if (error.code === "23505") throw new DuplicatePhoneError();
  throw new Error(error.message);
}

/*
 * Every query filters by ctx.agencyId in addition to RLS: the tenant always comes from the
 * server-side context, never from client input.
 */

export async function listCustomers(db: SupabaseServerClient, ctx: TenantContext, query: CustomerListQuery) {
  const from = (query.page - 1) * CUSTOMERS_PAGE_SIZE;
  let request = db
    .from("customers")
    .select(LIST_COLUMNS, { count: "exact" })
    .eq("agency_id", ctx.agencyId)
    .is("anonymized_at", null)
    .order("created_at", { ascending: false })
    .range(from, from + CUSTOMERS_PAGE_SIZE - 1);

  request = query.status === "archived" ? request.not("archived_at", "is", null) : request.is("archived_at", null);

  if (query.q) {
    const pattern = toIlikePattern(query.q);
    const digits = query.q.replace(/\D/g, "");
    const filters = [`full_name.ilike.${pattern}`, `email.ilike.${pattern}`];
    if (digits.length >= 4) filters.push(`phone_e164.ilike.%${digits}%`);
    request = request.or(filters.join(","));
  }

  const { data, error, count } = await request.overrideTypes<CustomerListItem[], { merge: false }>();
  if (error) raise(error);
  return { items: data ?? [], total: count ?? 0 };
}

export async function getCustomer(db: SupabaseServerClient, ctx: TenantContext, id: string) {
  const { data, error } = await db
    .from("customers")
    .select("*")
    .eq("agency_id", ctx.agencyId)
    .eq("id", id)
    .is("anonymized_at", null)
    .maybeSingle();
  if (error) raise(error);
  return data;
}

export async function countCustomers(db: SupabaseServerClient, ctx: TenantContext, options: { createdInLastDays?: number } = {}) {
  let request = db
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", ctx.agencyId)
    .is("archived_at", null)
    .is("anonymized_at", null);
  if (options.createdInLastDays) {
    const since = new Date(Date.now() - options.createdInLastDays * 86_400_000);
    request = request.gte("created_at", since.toISOString());
  }
  const { count, error } = await request;
  if (error) raise(error);
  return count ?? 0;
}

export async function createCustomer(db: SupabaseServerClient, ctx: TenantContext, input: CustomerInput) {
  const { data, error } = await db
    .from("customers")
    .insert({ ...input, agency_id: ctx.agencyId, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) raise(error);
  return data;
}

export async function updateCustomer(db: SupabaseServerClient, ctx: TenantContext, id: string, input: CustomerInput) {
  const { data, error } = await db
    .from("customers")
    .update(input)
    .eq("agency_id", ctx.agencyId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) raise(error);
  return data;
}

export async function setCustomerArchived(db: SupabaseServerClient, ctx: TenantContext, id: string, archived: boolean) {
  const { data, error } = await db
    .from("customers")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("agency_id", ctx.agencyId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) raise(error);
  return data;
}
