import "server-only";

import type { Tables } from "@/server/db/database.types";
import type { SupabaseServiceClient } from "@/server/db/service-client";

type DomainEvent = Tables<"domain_events">;
type Consumer = (db: SupabaseServiceClient, event: DomainEvent) => Promise<void>;

/** Won deal → owners and managers of that agency get "💰 Viagem confirmada". */
const notifyDealWon: Consumer = async (db, event) => {
  if (event.type !== "deal.stage_changed" || (event.payload as { won?: boolean }).won !== true) return;

  const [{ data: deal }, { data: managers }] = await Promise.all([
    db.from("deals").select("title").eq("id", event.aggregate_id).eq("agency_id", event.agency_id).maybeSingle(),
    db.from("agency_members").select("user_id").eq("agency_id", event.agency_id).eq("status", "active").in("role", ["owner", "manager"]),
  ]);
  if (!deal || !managers?.length) return;

  const { error } = await db.from("notifications").insert(
    managers
      .filter((m) => m.user_id !== event.actor_id)
      .map((m) => ({
        agency_id: event.agency_id,
        user_id: m.user_id,
        type: "proposal_accepted" as const,
        title: `💰 Viagem confirmada: ${deal.title}`.slice(0, 160),
        entity_type: "deal",
        entity_id: event.aggregate_id,
      })),
  );
  if (error) throw new Error(error.message);
};

/** Registry of event consumers. Follow-ups, automations and analytics plug in here in later phases. */
const CONSUMERS: Consumer[] = [notifyDealWon];

/**
 * Claims pending events (marking them dispatched) and runs every consumer. A failing consumer is
 * logged and does not block the others; events are not re-dispatched, so consumers must be safe
 * to skip rather than rely on retries.
 */
export async function dispatchDomainEvents(db: SupabaseServiceClient): Promise<{ dispatched: number; errors: number }> {
  const { data: events, error } = await db.rpc("claim_domain_events", { p_limit: 200 });
  if (error) throw new Error(error.message);

  let errors = 0;
  for (const event of events ?? []) {
    for (const consumer of CONSUMERS) {
      try {
        await consumer(db, event);
      } catch (consumerError) {
        errors++;
        console.error("[events] consumer failed", event.type, event.id, consumerError instanceof Error ? consumerError.message : consumerError);
      }
    }
  }
  return { dispatched: events?.length ?? 0, errors };
}
