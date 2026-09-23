import { describe, expect, it } from "vitest";

import { parseThresholds, scoreLead, temperatureFor } from "@/modules/deals/scoring";
import type { CompletenessFields } from "@/modules/travel-requests/completeness";

const empty: CompletenessFields = {
  destination: null,
  origin_city: null,
  date_flexibility: "undecided",
  departure_date: null,
  return_date: null,
  travel_month: null,
  adults: null,
  budget_cents: null,
  needs_flights: false,
  needs_hotel: false,
  needs_transfer: false,
  needs_insurance: false,
  needs_tours: false,
  hotel_category: null,
};

describe("scoreLead", () => {
  it("scores zero without a request", () => {
    expect(scoreLead(null).total).toBe(0);
  });

  it("adds destination, dates, party, budget and completeness", () => {
    const r = {
      ...empty,
      destination: "Maceió",
      date_flexibility: "exact" as const,
      departure_date: "2026-12-10",
      return_date: "2026-12-17",
      adults: 2,
      budget_cents: 800000,
    };
    const score = scoreLead(r);
    expect(score.total).toBe(60);
    expect(score.matched.map((m) => m.key)).toEqual(["destination_set", "dates_set", "party_set", "budget_set", "request_complete"]);
  });

  it("counts server-validated signals once and caps at 100", () => {
    const full = { ...empty, destination: "Paris", date_flexibility: "month_only" as const, travel_month: "2027-05-01", adults: 2, budget_cents: 1 };
    const score = scoreLead(full, ["asked_quote", "proposal_viewed", "purchase_intent", "asked_quote"]);
    expect(score.total).toBe(100);
  });
});

describe("temperature", () => {
  it("uses the default bands 0–30 / 31–60 / 61–100", () => {
    expect(temperatureFor(30)).toBe("cold");
    expect(temperatureFor(31)).toBe("warm");
    expect(temperatureFor(60)).toBe("warm");
    expect(temperatureFor(61)).toBe("hot");
  });

  it("honours agency thresholds and rejects malformed settings", () => {
    const t = parseThresholds({ warm: 20, hot: 50 });
    expect(temperatureFor(25, t)).toBe("warm");
    expect(parseThresholds({ warm: 70, hot: 40 })).toEqual({ warm: 31, hot: 61 });
    expect(parseThresholds("x")).toEqual({ warm: 31, hot: 61 });
  });
});
