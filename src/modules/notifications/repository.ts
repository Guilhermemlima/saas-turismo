import "server-only";

import type { TenantContext } from "@/server/auth/tenant";
import type { NotificationType } from "@/server/db/database.types";
import type { SupabaseServerClient } from "@/server/db/server-client";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
};

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  conversation: (id) => `/inbox/${id}`,
  travel_request: (id) => `/requests/${id}`,
  customer: (id) => `/customers/${id}`,
  task: () => "/tasks",
};

export async function listNotifications(db: SupabaseServerClient, ctx: TenantContext) {
  const [{ data, error }, { count }] = await Promise.all([
    db
      .from("notifications")
      .select("id, type, title, body, entity_type, entity_id, read_at, created_at")
      .eq("agency_id", ctx.agencyId)
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(15),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", ctx.agencyId)
      .eq("user_id", ctx.userId)
      .is("read_at", null),
  ]);
  if (error) throw new Error(error.message);

  const items: NotificationItem[] = (data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    href: n.entity_type && n.entity_id && ENTITY_ROUTES[n.entity_type] ? ENTITY_ROUTES[n.entity_type](n.entity_id) : null,
    read: n.read_at !== null,
    createdAt: n.created_at,
  }));
  return { items, unread: count ?? 0 };
}
