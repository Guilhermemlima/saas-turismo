import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requirePublicEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Request-scoped Supabase client authenticated as the current user (RLS applies).
 * Create a new one per request; never share between requests.
 */
export async function createSupabaseServerClient() {
  // Reading cookies first marks the route as dynamic, so authenticated pages are never prerendered.
  const cookieStore = await cookies();
  const env = requirePublicEnv();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. The proxy refreshes sessions.
        }
      },
    },
  });
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
