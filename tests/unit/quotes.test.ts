import { describe, expect, it } from "vitest";

import { linePriceCents, markupForMarginPct, optionTotals } from "@/modules/quotes/pricing";
import { autoItemTitle, itemDetailsSchemas, quoteItemInputSchema } from "@/modules/quotes/schemas";

describe("pricing (mirrors the database test case)", () => {
  const flight = { quantity: 2, unitCostCents: 100000, unitMarkupCents: 15000, unitFeesCents: 8000, commissionCents: 0 };
  const hotel = { quantity: 1, unitCostCents: 300000, unitMarkupCents: 45000, unitFeesCents: 0, commissionCents: 30000 };

  it("computes line prices", () => {
    expect(linePriceCents(flight)).toBe(246000);
  });

  it("computes option totals like the database", () => {
    const t = optionTotals([flight, hotel], 20000, 0);
    expect(t).toMatchObject({
      subtotalCents: 591000,
      costCents: 500000,
      totalCents: 611000,
      marginCents: 95000,
      commissionCents: 30000,
      grossProfitCents: 125000,
    });
    expect(t.marginRate).toBeCloseTo(95000 / 611000);
  });

  it("applies discounts and handles empty options", () => {
    expect(optionTotals([flight, hotel], 20000, 11000).totalCents).toBe(600000);
    expect(optionTotals([], 0, 0).marginRate).toBeNull();
  });

  it("derives markup from a target margin", () => {
    // cost 1.000 → 20% margin on the price means price 1.250, markup 250
    expect(markupForMarginPct(100000, 0, 20)).toBe(25000);
    expect(markupForMarginPct(100000, 0, 0)).toBe(0);
  });
});

describe("quote item input", () => {
  it("parses Brazilian money inputs and defaults", () => {
    const item = quoteItemInputSchema.parse({
      item_type: "hotel",
      quantity: "",
      unit_cost_cents: "3.000,00",
      unit_markup_cents: "450",
      unit_fees_cents: "",
      commission_cents: "300",
      show_price_to_customer: "on",
    });
    expect(item).toMatchObject({ quantity: 1, unit_cost_cents: 300000, unit_markup_cents: 45000, unit_fees_cents: 0, commission_cents: 30000 });
  });

  it("rejects invalid values", () => {
    expect(quoteItemInputSchema.safeParse({ item_type: "spaceship" }).success).toBe(false);
    expect(quoteItemInputSchema.safeParse({ item_type: "tour", unit_cost_cents: "abc" }).success).toBe(false);
    expect(quoteItemInputSchema.safeParse({ item_type: "tour", start_date: "2026-12-10", end_date: "2026-12-01" }).success).toBe(false);
  });

  it("validates type-specific details and drops unknown keys", () => {
    const details = itemDetailsSchemas.flight.parse({ airline: "LATAM", stops: "0", cabin: "business", hacker: "x" });
    expect(details).toEqual({ airline: "LATAM", stops: 0, cabin: "business" });
    expect(itemDetailsSchemas.hotel.safeParse({ category: "7" }).success).toBe(false);
  });

  it("builds readable titles", () => {
    expect(autoItemTitle("flight", { airline: "LATAM", origin: "Recife", destination: "Maceió" })).toBe("LATAM · Recife → Maceió");
    expect(autoItemTitle("hotel", {})).toBe("Hospedagem");
    expect(autoItemTitle("insurance", { plan: "Ouro" })).toBe("Seguro · Ouro");
  });
});
