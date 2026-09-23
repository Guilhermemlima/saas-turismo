import { describe, expect, it, vi } from "vitest";

import { runJobs, scheduleRecurringJobs } from "@/server/jobs/runner";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null }>;

/** Minimal fake of the service client: records RPC calls, serves a queue of claimed batches. */
function fakeDb(batches: unknown[][]) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc = vi.fn<Rpc>(async (name, args) => {
    calls.push({ name, args });
    if (name === "claim_jobs") return { data: batches.shift() ?? [], error: null };
    if (name === "fail_job") return { data: args.p_retryable ? "queued" : "failed", error: null };
    if (name === "claim_domain_events") return { data: [], error: null };
    return { data: null, error: null };
  });
  return { db: { rpc } as never, calls };
}

const job = (type: string, payload: unknown = {}) => ({ id: crypto.randomUUID(), type, payload });

describe("runJobs", () => {
  it("completes known jobs and fails unknown types permanently (no retry loop)", async () => {
    const { db, calls } = fakeDb([[job("system.noop"), job("typo.job")]]);
    const summary = await runJobs(db, { workerId: "test", budgetMs: 5_000 });

    expect(summary).toMatchObject({ claimed: 2, succeeded: 1, failed: 1, retried: 0 });
    expect(calls.filter((c) => c.name === "complete_job")).toHaveLength(1);
    expect(calls.find((c) => c.name === "fail_job")?.args).toMatchObject({ p_retryable: false });
  });

  it("stops when the queue is empty", async () => {
    const { db, calls } = fakeDb([]);
    const summary = await runJobs(db, { workerId: "test", budgetMs: 5_000 });
    expect(summary.claimed).toBe(0);
    expect(calls.filter((c) => c.name === "claim_jobs")).toHaveLength(1);
  });

  it("dispatches domain events through the registry", async () => {
    const { db, calls } = fakeDb([[job("events.dispatch")]]);
    const summary = await runJobs(db, { workerId: "test", budgetMs: 5_000 });
    expect(summary.succeeded).toBe(1);
    expect(calls.some((c) => c.name === "claim_domain_events")).toBe(true);
  });
});

describe("scheduleRecurringJobs", () => {
  it("dedupes recurring jobs per time bucket", async () => {
    const { db, calls } = fakeDb([]);
    const at = new Date("2026-09-23T12:07:30Z");
    await scheduleRecurringJobs(db, at);
    await scheduleRecurringJobs(db, new Date("2026-09-23T12:07:50Z"));
    const keys = calls.filter((c) => c.name === "enqueue_job").map((c) => c.args.p_dedupe_key);
    // Same minute → same keys, so the database ignores the second round.
    expect(keys.slice(0, 2)).toEqual(keys.slice(2, 4));
    expect(keys[0]).toMatch(/^events\.dispatch:\d+$/);
  });
});
