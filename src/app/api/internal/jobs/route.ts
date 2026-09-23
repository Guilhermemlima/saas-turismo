import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServiceClient } from "@/server/db/service-client";
import { getServerEnv, isJobsConfigured } from "@/server/env";
import { runJobs, scheduleRecurringJobs } from "@/server/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = getServerEnv().CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Called every minute by Supabase Cron (pg_cron + pg_net). Schedules recurring jobs and drains
 * the queue within the function time budget.
 */
export async function POST(request: NextRequest) {
  if (!isJobsConfigured()) {
    return NextResponse.json({ error: "jobs not configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createSupabaseServiceClient();
  await scheduleRecurringJobs(db);
  const summary = await runJobs(db, { workerId: `vercel-${crypto.randomUUID().slice(0, 8)}`, budgetMs: 45_000 });
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
