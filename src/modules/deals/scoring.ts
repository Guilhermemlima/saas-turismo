import { isRequestComplete, type CompletenessFields } from "@/modules/travel-requests/completeness";

/**
 * Rule-based lead score (briefing §33). The AI never sets the score: it can only report
 * signals later, and the weights live here, on the server.
 */
export const LEAD_SCORE_RULES = [
  { key: "destination_set", label: "Destino informado", points: 10 },
  { key: "dates_set", label: "Datas definidas", points: 10 },
  { key: "party_set", label: "Passageiros definidos", points: 10 },
  { key: "budget_set", label: "Orçamento informado", points: 15 },
  { key: "request_complete", label: "Solicitação completa", points: 15 },
  // Delivered with quotes, proposals and the AI agent (phases 13, 16 and 17).
  { key: "asked_quote", label: "Pediu cotação", points: 20 },
  { key: "proposal_viewed", label: "Visualizou proposta", points: 10 },
  { key: "purchase_intent", label: "Demonstrou intenção de compra", points: 10 },
] as const;

export type LeadScoreRuleKey = (typeof LEAD_SCORE_RULES)[number]["key"];

export type LeadScoreBreakdown = { total: number; matched: { key: LeadScoreRuleKey; label: string; points: number }[] };

function hasDates(r: CompletenessFields): boolean {
  return Boolean(r.departure_date || r.travel_month);
}

export function scoreLead(request: CompletenessFields | null, signals: readonly LeadScoreRuleKey[] = []): LeadScoreBreakdown {
  const facts = new Set<LeadScoreRuleKey>(signals);
  if (request) {
    if (request.destination?.trim()) facts.add("destination_set");
    if (hasDates(request)) facts.add("dates_set");
    if ((request.adults ?? 0) >= 1) facts.add("party_set");
    if (request.budget_cents !== null) facts.add("budget_set");
    if (isRequestComplete(request)) facts.add("request_complete");
  }
  const matched = LEAD_SCORE_RULES.filter((rule) => facts.has(rule.key)).map(({ key, label, points }) => ({ key, label, points }));
  return { total: Math.min(100, matched.reduce((sum, rule) => sum + rule.points, 0)), matched };
}

export type Temperature = "cold" | "warm" | "hot";

export type TemperatureThresholds = { warm: number; hot: number };

export const DEFAULT_THRESHOLDS: TemperatureThresholds = { warm: 31, hot: 61 };

/** Accepts the agency_settings JSON; falls back to the defaults when it is malformed. */
export function parseThresholds(value: unknown): TemperatureThresholds {
  if (value && typeof value === "object") {
    const { warm, hot } = value as Record<string, unknown>;
    if (typeof warm === "number" && typeof hot === "number" && warm > 0 && hot > warm && hot <= 100) return { warm, hot };
  }
  return DEFAULT_THRESHOLDS;
}

export function temperatureFor(score: number, thresholds: TemperatureThresholds = DEFAULT_THRESHOLDS): Temperature {
  if (score >= thresholds.hot) return "hot";
  if (score >= thresholds.warm) return "warm";
  return "cold";
}

export const TEMPERATURE_LABELS: Record<Temperature, string> = { cold: "Frio", warm: "Morno", hot: "Quente" };
