import { describe, expect, it } from "vitest";

import { itemDetailsSummary } from "@/modules/quotes/labels";
import {
  divideHalfEven,
  itemTotal,
  itemUnitPrice,
  marginPercent,
  maxDiscount,
  optionTotals,
  parsePercentToBasisPoints,
  percentOf,
  type PricedItemInput,
} from "@/modules/quotes/pricing";
import { optionInputSchema, parseItemForm } from "@/modules/quotes/schemas";

const item = (overrides: Partial<PricedItemInput> = {}): PricedItemInput => ({
  quantity: 1,
  cost_cents: 0,
  markup_cents: 0,
  pass_through_fees_cents: 0,
  commission_cents: 0,
  ...overrides,
});

describe("quote pricing", () => {
  it("prices an item as cost + markup + fees, times quantity", () => {
    const flight = item({ quantity: 2, cost_cents: 100_000, markup_cents: 10_000, pass_through_fees_cents: 5_000 });
    expect(itemUnitPrice(flight)).toBe(115_000);
    expect(itemTotal(flight)).toBe(230_000);
  });

  it("computes the option totals exactly like the database (migration 0014)", () => {
    const totals = optionTotals(
      [
        item({ quantity: 2, cost_cents: 100_000, markup_cents: 10_000, pass_through_fees_cents: 5_000 }),
        item({ cost_cents: 300_000, markup_cents: 45_000, commission_cents: 30_000 }),
      ],
      { service_fee_cents: 15_000, discount_cents: 20_000 },
    );
    expect(totals).toEqual({
      subtotal_cents: 575_000,
      service_fee_cents: 15_000,
      discount_cents: 20_000,
      total_cents: 570_000,
      cost_total_cents: 500_000,
      margin_cents: 60_000,
      commission_total_cents: 30_000,
      gross_profit_cents: 90_000,
    });
  });

  it("prices two options built from the five main item types", () => {
    const types = [
      item({ cost_cents: 250_000, markup_cents: 25_000 }), // flight
      item({ cost_cents: 400_000, markup_cents: 60_000, commission_cents: 40_000 }), // hotel
      item({ quantity: 2, cost_cents: 8_000, markup_cents: 2_000 }), // transfer
      item({ quantity: 4, cost_cents: 15_000, markup_cents: 3_000 }), // tour
      item({ quantity: 4, cost_cents: 9_000, markup_cents: 1_000 }), // insurance
    ];
    const economic = optionTotals(types, { service_fee_cents: 0, discount_cents: 0 });
    const premium = optionTotals(types.map((t) => ({ ...t, markup_cents: t.markup_cents * 2 })), { service_fee_cents: 10_000, discount_cents: 5_000 });
    expect(economic.total_cents).toBe(275_000 + 460_000 + 20_000 + 72_000 + 40_000);
    expect(premium.total_cents - economic.total_cents).toBe(25_000 + 60_000 + 4_000 + 12_000 + 4_000 + 10_000 - 5_000);
  });

  it("keeps an empty option at zero", () => {
    expect(optionTotals([], { service_fee_cents: 0, discount_cents: 0 }).total_cents).toBe(0);
    expect(marginPercent({ margin_cents: 0, total_cents: 0 })).toBeNull();
  });

  it("caps the discount at the option value", () => {
    expect(maxDiscount(575_000, 15_000)).toBe(590_000);
    expect(maxDiscount(0, 0)).toBe(0);
  });

  it("reports margin percent over the sale price", () => {
    expect(marginPercent({ margin_cents: 60_000, total_cents: 570_000 })).toBe(10.5);
  });
});

describe("rounding", () => {
  it("rounds half to even", () => {
    expect(divideHalfEven(5, 2)).toBe(2); // 2.5 → 2
    expect(divideHalfEven(7, 2)).toBe(4); // 3.5 → 4
    expect(divideHalfEven(10, 4)).toBe(2); // 2.5 → 2
    expect(divideHalfEven(11, 4)).toBe(3); // 2.75 → 3
    expect(divideHalfEven(9, 4)).toBe(2); // 2.25 → 2
  });

  it("applies percentages in cents without float drift", () => {
    expect(percentOf(333_335, 1_000)).toBe(33_334); // 10% of R$ 3.333,35 = 333,335 → 333,34
    expect(percentOf(333_325, 1_000)).toBe(33_332); // 333,325 → 333,32 (even)
    expect(percentOf(100_000, 1_250)).toBe(12_500);
    expect(percentOf(0, 5_000)).toBe(0);
  });

  it("parses percentages", () => {
    expect(parsePercentToBasisPoints("10%")).toBe(1_000);
    expect(parsePercentToBasisPoints("12,5%")).toBe(1_250);
    expect(parsePercentToBasisPoints("0.75")).toBe(75);
    expect(parsePercentToBasisPoints("abc%")).toBeNull();
    expect(parsePercentToBasisPoints("1,234%")).toBeNull();
    expect(parsePercentToBasisPoints("1001%")).toBeNull();
  });
});

describe("item form", () => {
  const base = { item_type: "hotel", title: "Resort Maragogi", quantity: "2", cost_cents: "1.000,00", markup: "10%", commission: "50,00" };

  it("resolves percentage markup against the unit cost and money commission", () => {
    const result = parseItemForm({ ...base, d_category: "5", d_meal_plan: "all_inclusive", d_room_type: "" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.markup_cents).toBe(10_000);
    expect(result.data.commission_cents).toBe(5_000);
    expect(result.data.quantity).toBe(2);
    expect(result.data.details).toEqual({ category: 5, meal_plan: "all_inclusive" });
    expect(result.data.show_price_to_customer).toBe(false);
  });

  it("ignores detail fields that belong to another item type", () => {
    const result = parseItemForm({ ...base, item_type: "tour", d_category: "5", d_location: "Maragogi" });
    expect(result.success && result.data.details).toEqual({ location: "Maragogi" });
  });

  it("reports detail errors under the form field name", () => {
    const result = parseItemForm({ ...base, item_type: "flight", d_stops: "9" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].path).toEqual(["d_stops"]);
  });

  it("rejects invalid values", () => {
    expect(parseItemForm({ ...base, markup: "dez" }).success).toBe(false);
    expect(parseItemForm({ ...base, quantity: "0" }).success).toBe(false);
    expect(parseItemForm({ ...base, item_type: "cruise" }).success).toBe(false);
    expect(parseItemForm({ ...base, start_date: "2027-01-10", end_date: "2027-01-05" }).success).toBe(false);
  });

  it("parses option money fields, empty meaning zero", () => {
    expect(optionInputSchema.parse({ title: "Opção 1", service_fee_cents: "150", discount_cents: "" })).toMatchObject({
      service_fee_cents: 15_000,
      discount_cents: 0,
    });
    expect(optionInputSchema.safeParse({ title: "Opção 1", service_fee_cents: "-5" }).success).toBe(false);
  });
});

describe("item summary", () => {
  it("summarizes flights and hotels", () => {
    expect(itemDetailsSummary("flight", { airline: "LATAM", route: "GRU → MCZ", cabin: "economy", stops: 0 })).toBe(
      "LATAM · GRU → MCZ · Econômica · Direto",
    );
    expect(itemDetailsSummary("hotel", { category: 5, rooms: 2, meal_plan: "all_inclusive" })).toBe("5★ · 2 quartos · All inclusive");
    expect(itemDetailsSummary("other", {})).toBeNull();
    expect(itemDetailsSummary("hotel", null)).toBeNull();
  });
});
