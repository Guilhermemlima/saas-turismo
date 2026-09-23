import "server-only";

import type { TenantContext } from "@/server/auth/tenant";
import type { PreferenceCategory } from "@/server/db/database.types";
import type { SupabaseServerClient } from "@/server/db/server-client";

export type TagOption = { id: string; name: string; color: string };
export type CustomerNote = { id: string; body: string; authorId: string | null; authorName: string | null; createdAt: string };
export type CustomerPreference = { id: string; category: PreferenceCategory; value: string; source: string };

function raise(error: { message: string }): never {
  throw new Error(error.message);
}

export async function getCustomerDetails(db: SupabaseServerClient, ctx: TenantContext, customerId: string) {
  const [tags, applied, notes, preferences] = await Promise.all([
    db.from("tags").select("id, name, color").eq("agency_id", ctx.agencyId).order("name"),
    db.from("customer_tags").select("tag_id").eq("agency_id", ctx.agencyId).eq("customer_id", customerId),
    db
      .from("notes")
      .select("id, body, author_user_id, created_at, author:profiles ( full_name )")
      .eq("agency_id", ctx.agencyId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50)
      .overrideTypes<{ id: string; body: string; author_user_id: string | null; created_at: string; author: { full_name: string } | null }[], { merge: false }>(),
    db
      .from("customer_preferences")
      .select("id, category, value, source")
      .eq("agency_id", ctx.agencyId)
      .eq("customer_id", customerId)
      .order("created_at"),
  ]);
  for (const result of [tags, applied, notes, preferences]) if (result.error) raise(result.error);

  const appliedIds = new Set((applied.data ?? []).map((t) => t.tag_id));
  return {
    allTags: (tags.data ?? []) as TagOption[],
    customerTagIds: [...appliedIds],
    notes: (notes.data ?? []).map((n) => ({
      id: n.id,
      body: n.body,
      authorId: n.author_user_id,
      authorName: n.author?.full_name ?? null,
      createdAt: n.created_at,
    })) as CustomerNote[],
    preferences: (preferences.data ?? []) as CustomerPreference[],
  };
}
