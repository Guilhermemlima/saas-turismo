import { describe, expect, it } from "vitest";

import { formatTripDates, isIsoDate, todayInTimeZone } from "@/lib/dates";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/money";
import {
  completionPercent,
  isRequestComplete,
  travelRequestChecklist,
  type CompletenessFields,
} from "@/modules/travel-requests/completeness";
import { travelRequestInputSchema } from "@/modules/travel-requests/schemas";

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

describe("money", () => {
  it.each([
    ["8.000", 800000],
    ["8000", 800000],
    ["8.000,50", 800050],
    ["R$ 7.650,00", 765000],
    ["7650.5", 765050],
    ["1.234.567", 123456700],
  ])("parses %s", (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "-10", "8,00,00", "1.2.3"])("rejects %s", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });

  it("formats BRL and round-trips to input", () => {
    expect(formatMoney(800000).replace(/\s/g, " ")).toBe("R$ 8.000,00");
    expect(centsToInput(800050)).toBe("8.000,50");
    expect(centsToInput(800000)).toBe("8.000");
  });
});

describe("dates", () => {
  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-12-10")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("10/12/2026")).toBe(false);
  });

  it("computes today in the agency time zone", () => {
    // 02:00 UTC on Jan 1st is still Dec 31st in São Paulo.
    expect(todayInTimeZone("America/Sao_Paulo", new Date("2027-01-01T02:00:00Z"))).toBe("2026-12-31");
  });

  it("formats trip ranges", () => {
    expect(formatTripDates("2026-12-10", "2026-12-17", null)).toBe("10–17 dez");
    expect(formatTripDates("2026-12-03", "2026-12-09", null)).toBe("03–09 dez");
    expect(formatTripDates("2026-12-28", "2027-01-03", null)).toBe("28 dez – 03 jan");
    expect(formatTripDates(null, null, "2026-12-01")).toBe("dezembro de 2026");
    expect(formatTripDates(null, null, null)).toBeNull();
  });
});

describe("completeness", () => {
  it("an empty request misses the essentials", () => {
    expect(isRequestComplete(empty)).toBe(false);
    expect(completionPercent(empty)).toBe(0);
  });

  it("the briefing example (Maceió, 10–17 Dec, 2 adults + 1 child) is complete", () => {
    const r = {
      ...empty,
      destination: "Maceió",
      date_flexibility: "exact" as const,
      departure_date: "2026-12-10",
      return_date: "2026-12-17",
      adults: 2,
    };
    expect(isRequestComplete(r)).toBe(true);
  });

  it("requires the origin only when flights are needed", () => {
    const base = { ...empty, destination: "Paris", date_flexibility: "month_only" as const, travel_month: "2027-05-01", adults: 1 };
    expect(isRequestComplete(base)).toBe(true);
    expect(isRequestComplete({ ...base, needs_flights: true })).toBe(false);
    expect(isRequestComplete({ ...base, needs_flights: true, origin_city: "Recife" })).toBe(true);
  });

  it("exact dates need both departure and return", () => {
    const r = { ...empty, destination: "Cancún", date_flexibility: "exact" as const, departure_date: "2027-01-05", adults: 2 };
    expect(travelRequestChecklist(r).find((i) => i.key === "dates")?.done).toBe(false);
  });
});

describe("travelRequestInputSchema", () => {
  it("parses a realistic form submission", () => {
    const data = travelRequestInputSchema.parse({
      destination: " Maceió ",
      date_flexibility: "exact",
      departure_date: "2026-12-10",
      return_date: "2026-12-17",
      adults: "2",
      children_ages: "4, 9",
      infants: "",
      budget_cents: "8.000",
      needs_hotel: "on",
      hotel_category: "4",
      trip_types: ["family"],
      travel_month: "",
    });
    expect(data).toMatchObject({
      destination: "Maceió",
      adults: 2,
      children_ages: [4, 9],
      infants: 0,
      budget_cents: 800000,
      budget_scope: "total",
      needs_hotel: true,
      needs_flights: false,
      hotel_category: 4,
      trip_types: ["family"],
      travel_month: null,
    });
  });

  it("accepts 'e' as separator for ages and converts month input", () => {
    const data = travelRequestInputSchema.parse({ children_ages: "4 e 9", travel_month: "2026-12" });
    expect(data.children_ages).toEqual([4, 9]);
    expect(data.travel_month).toBe("2026-12-01");
    expect(data.budget_scope).toBeNull();
  });

  it.each([
    [{ children_ages: "18" }, "children_ages"],
    [{ departure_date: "2026-12-17", return_date: "2026-12-10" }, "return_date"],
    [{ departure_date: "2026-02-30" }, "departure_date"],
    [{ adults: "0" }, "adults"],
    [{ hotel_category: "6" }, "hotel_category"],
    [{ budget_cents: "muito" }, "budget_cents"],
    [{ trip_types: ["space"] }, "trip_types"],
  ])("rejects %j", (input, field) => {
    const result = travelRequestInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === field)).toBe(true);
  });
});
