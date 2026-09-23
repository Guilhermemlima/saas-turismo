import "server-only";

import { z } from "zod";

import type { Tables } from "@/server/db/database.types";
import type { SupabaseServiceClient } from "@/server/db/service-client";

import { PermanentJobError } from "./errors";
import { dispatchDomainEvents } from "./handlers/dispatch-events";
import { scanOverdueTasks } from "./handlers/overdue-tasks";

type Job = Tables<"jobs">;
type Handler = (db: SupabaseServiceClient, job: Job) => Promise<unknown>;

/**
 * Job registry: each type validates its own payload. Types not listed here fail permanently,
 * so a typo never loops through retries.
 */
export const JOB_HANDLERS: Record<string, Handler> = {
  "tasks.scan_overdue": (db) => scanOverdueTasks(db),
  "events.dispatch": (db) => dispatchDomainEvents(db),
  "system.noop": async (_db, job) => z.object({}).passthrough().parse(job.payload),
};

/** Recurring jobs, deduplicated per time bucket so each runs at most once per interval. */
const RECURRING: { type: string; everyMinutes: number }[] = [
  { type: "events.dispatch", everyMinutes: 1 },
  { type: "tasks.scan_overdue", everyMinutes: 15 },
];

export async function scheduleRecurringJobs(db: SupabaseServiceClient, now: Date = new Date()) {
  for (const job of RECURRING) {
    const bucket = Math.floor(now.getTime() / (job.everyMinutes * 60_000));
    const { error } = await db.rpc("enqueue_job", { p_type: job.type, p_dedupe_key: `${job.type}:${bucket}`, p_max_attempts: 3 });
    if (error) throw new Error(error.message);
  }
}

export type RunSummary = { claimed: number; succeeded: number; retried: number; failed: number; elapsedMs: number };

/**
 * Processes ready jobs until the time budget is used. Serverless-safe: a run that is cut off
 * leaves its jobs locked; `claim_jobs` reclaims them after the lock timeout.
 */
export async function runJobs(db: SupabaseServiceClient, options: { workerId: string; budgetMs: number; batchSize?: number }): Promise<RunSummary> {
  const started = Date.now();
  const summary: RunSummary = { claimed: 0, succeeded: 0, retried: 0, failed: 0, elapsedMs: 0 };

  while (Date.now() - started < options.budgetMs) {
    const { data: jobs, error } = await db.rpc("claim_jobs", {
      p_worker: options.workerId,
      p_limit: options.batchSize ?? 10,
      p_lock_seconds: Math.ceil(options.budgetMs / 1000) + 60,
    });
    if (error) throw new Error(error.message);
    if (!jobs?.length) break;
    summary.claimed += jobs.length;

    for (const job of jobs) {
      const handler = JOB_HANDLERS[job.type];
      try {
        if (!handler) throw new PermanentJobError(`Unknown job type ${job.type}`);
        await handler(db, job);
        await db.rpc("complete_job", { p_id: job.id });
        summary.succeeded++;
      } catch (jobError) {
        const permanent = jobError instanceof PermanentJobError || jobError instanceof z.ZodError;
        const message = jobError instanceof Error ? jobError.message : String(jobError);
        const { data: status } = await db.rpc("fail_job", { p_id: job.id, p_error: message, p_retryable: !permanent });
        if (status === "queued") summary.retried++;
        else summary.failed++;
        console.error("[jobs] job failed", job.type, job.id, message);
      }
    }
  }

  summary.elapsedMs = Date.now() - started;
  return summary;
}
