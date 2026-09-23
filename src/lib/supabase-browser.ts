"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/server/db/database.types";

import { requirePublicEnv } from "./env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Browser client, used only for Realtime subscriptions. It carries the user's session, so RLS
 * decides which rows each subscriber can receive. All writes still go through Server Actions.
 */
export function getSupabaseBrowserClient() {
  if (!client) {
    const env = requirePublicEnv();
    client = createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return client;
}
