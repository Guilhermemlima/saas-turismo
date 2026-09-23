import "server-only";

import { createClient } from "@supabase/supabase-js";

import { requirePublicEnv } from "@/lib/env";
import { requireServerEnv } from "@/server/env";

import type { Database } from "./database.types";

/**
 * Service-role client: bypasses RLS. Only background jobs (and later webhooks and the platform
 * admin) may use it, and every query MUST filter by agency_id explicitly. Never import it from
 * a page, Server Action or component.
 */
export function createSupabaseServiceClient() {
  const env = requirePublicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;
