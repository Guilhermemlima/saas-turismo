import "server-only";

import type { SupabaseServiceClient } from "@/server/db/service-client";

const DAY = 86_400_000;

/** Retention: finished jobs after 7 days, dispatched events after 30. Failed/dead jobs are kept for analysis. */
export async function cleanupQueue(db: SupabaseServiceClient, now: Date = new Date()) {
  const [jobs, events] = await Promise.all([
    db.from("jobs").delete({ count: "exact" }).eq("status", "succeeded").lt("finished_at", new Date(now.getTime() - 7 * DAY).toISOString()),
    db.from("domain_events").delete({ count: "exact" }).not("dispatched_at", "is", null).lt("dispatched_at", new Date(now.getTime() - 30 * DAY).toISOString()),
  ]);
  if (jobs.error) throw new Error(jobs.error.message);
  if (events.error) throw new Error(events.error.message);
  return { jobsDeleted: jobs.count ?? 0, eventsDeleted: events.count ?? 0 };
}
