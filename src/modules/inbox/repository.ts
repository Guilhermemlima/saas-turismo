import "server-only";

import type { TenantContext } from "@/server/auth/tenant";
import type { Tables } from "@/server/db/database.types";
import type { SupabaseServerClient } from "@/server/db/server-client";

export type InboxFilter = "all" | "mine" | "unread";

export type ConversationListItem = Pick<
  Tables<"conversations">,
  "id" | "status" | "mode" | "is_simulation" | "last_message_at" | "last_message_preview" | "unread_count" | "assigned_member_id"
> & {
  customer: { id: string; full_name: string; phone_e164: string | null } | null;
  channel: { type: Tables<"channels">["type"]; display_name: string } | null;
};

export type ConversationDetail = Tables<"conversations"> & {
  customer: Pick<Tables<"customers">, "id" | "full_name" | "phone_e164" | "email" | "city" | "state" | "owner_member_id"> | null;
  channel: Pick<Tables<"channels">, "id" | "type" | "display_name" | "phone_e164"> | null;
  assigned: { id: string; display_name: string | null; profile: { full_name: string } | null } | null;
};

export type InboxMessage = Pick<Tables<"messages">, "id" | "direction" | "sender" | "kind" | "body" | "status" | "created_at"> & {
  author: { full_name: string } | null;
};

const LIST_COLUMNS = `id, status, mode, is_simulation, last_message_at, last_message_preview, unread_count, assigned_member_id,
  customer:customers!conversations_customer_fk ( id, full_name, phone_e164 ),
  channel:channels!conversations_channel_fk ( type, display_name )`;

function raise(error: { message: string }): never {
  throw new Error(error.message);
}

export async function listConversations(
  db: SupabaseServerClient,
  ctx: TenantContext,
  filters: { filter: InboxFilter; q: string },
) {
  let request = db
    .from("conversations")
    .select(LIST_COLUMNS)
    .eq("agency_id", ctx.agencyId)
    .neq("status", "closed")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (filters.filter === "mine") request = request.eq("assigned_member_id", ctx.memberId);
  if (filters.filter === "unread") request = request.gt("unread_count", 0);

  const { data, error } = await request.overrideTypes<ConversationListItem[], { merge: false }>();
  if (error) raise(error);

  // Customer-name search runs on the (small, already tenant-scoped) page instead of a join filter.
  const term = filters.q.trim().toLocaleLowerCase("pt-BR");
  const items = data ?? [];
  return term ? items.filter((c) => c.customer?.full_name.toLocaleLowerCase("pt-BR").includes(term) || c.customer?.phone_e164?.includes(term)) : items;
}

export async function getConversation(db: SupabaseServerClient, ctx: TenantContext, id: string) {
  const { data, error } = await db
    .from("conversations")
    .select(
      `*,
       customer:customers!conversations_customer_fk ( id, full_name, phone_e164, email, city, state, owner_member_id ),
       channel:channels!conversations_channel_fk ( id, type, display_name, phone_e164 ),
       assigned:agency_members!conversations_assigned_member_fk ( id, display_name, profile:profiles ( full_name ) )`,
    )
    .eq("agency_id", ctx.agencyId)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<ConversationDetail, { merge: false }>();
  if (error) raise(error);
  return data;
}

export async function listMessages(db: SupabaseServerClient, ctx: TenantContext, conversationId: string) {
  const { data, error } = await db
    .from("messages")
    .select("id, direction, sender, kind, body, status, created_at, author:profiles ( full_name )")
    .eq("agency_id", ctx.agencyId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200)
    .overrideTypes<InboxMessage[], { merge: false }>();
  if (error) raise(error);
  return (data ?? []).reverse();
}

export async function listCustomerConversations(db: SupabaseServerClient, ctx: TenantContext, customerId: string) {
  const { data, error } = await db
    .from("conversations")
    .select("id, status, is_simulation, last_message_at")
    .eq("agency_id", ctx.agencyId)
    .eq("customer_id", customerId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) raise(error);
  return data ?? [];
}

export async function countUnreadConversations(db: SupabaseServerClient, ctx: TenantContext) {
  const { count, error } = await db
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", ctx.agencyId)
    .neq("status", "closed")
    .gt("unread_count", 0);
  if (error) raise(error);
  return count ?? 0;
}
