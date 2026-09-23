"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

/** RLS already limits updates to the user's own rows; the filters keep the intent explicit. */
export async function markNotificationsReadAction(ids?: string[]): Promise<void> {
  const ctx = await getTenantContext();
  if (!ctx) return;
  const db = await createSupabaseServerClient();
  let request = db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("agency_id", ctx.agencyId)
    .eq("user_id", ctx.userId)
    .is("read_at", null);
  if (ids) request = request.in("id", z.array(z.uuid()).max(50).parse(ids));
  await request;
  revalidatePath("/", "layout");
}
