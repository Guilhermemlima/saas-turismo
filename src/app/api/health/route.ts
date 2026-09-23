import { NextResponse } from "next/server";

import { getAppUrl } from "@/lib/app-url";
import { isSupabaseConfigured } from "@/lib/env";
import { isJobsConfigured } from "@/server/env";

/** Liveness/configuration probe for Vercel and uptime monitors. Exposes no secrets. */
export function GET() {
  return NextResponse.json(
    { status: "ok", supabaseConfigured: isSupabaseConfigured(), jobsConfigured: isJobsConfigured(), appUrl: getAppUrl(), time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
