/**
 * Quote pricing engine (ARCHITECTURE.md §12). Pure and integer-only (cents): the database
 * recomputes the same values on every write (migration 0014), so this module is used to validate
 * input with friendly messages and to preview totals — never as the source of truth.
 */

export type PricedItemInput = {
  quantity: number;
  cost_cents: number;
  markup_cents: number;
  pass_through_fees_cents: number;
  commission_cents: number;
};

export type OptionAdjustments = { service_fee_cents: number; discount_cents: number };

export type OptionTotals = {
  subtotal_cents: number;
  service_fee_cents: number;
  discount_cents: number;
  total_cents: number;
  cost_total_cents: number;
  margin_cents: number;
  commission_total_cents: number;
  /** Margin + supplier commission: what the agency earns. */
  gross_profit_cents: number;
};

/** Unit sale price shown to the customer. */
export function itemUnitPrice(item: PricedItemInput): number {
  return item.cost_cents + item.markup_cents + item.pass_through_fees_cents;
}

export function itemTotal(item: PricedItemInput): number {
  return itemUnitPrice(item) * item.quantity;
}

export function optionTotals(items: readonly PricedItemInput[], adjustments: OptionAdjustments): OptionTotals {
  let subtotal = 0;
  let cost = 0;
  let markup = 0;
  let commission = 0;
  for (const item of items) {
    subtotal += itemTotal(item);
    cost += item.cost_cents * item.quantity;
    markup += item.markup_cents * item.quantity;
    commission += item.commission_cents * item.quantity;
  }
  const margin = markup + adjustments.service_fee_cents - adjustments.discount_cents;
  return {
    subtotal_cents: subtotal,
    service_fee_cents: adjustments.service_fee_cents,
    discount_cents: adjustments.discount_cents,
    total_cents: subtotal + adjustments.service_fee_cents - adjustments.discount_cents,
    cost_total_cents: cost,
    margin_cents: margin,
    commission_total_cents: commission,
    gross_profit_cents: margin + commission,
  };
}

/** The discount may reduce the option to zero, never below. */
export function maxDiscount(subtotalCents: number, serviceFeeCents: number): number {
  return subtotalCents + serviceFeeCents;
}

/** Margin over the sale price, in percent with one decimal (null when there is no price). */
export function marginPercent(totals: Pick<OptionTotals, "margin_cents" | "total_cents">): number | null {
  if (totals.total_cents <= 0) return null;
  return Math.round((totals.margin_cents / totals.total_cents) * 1000) / 10;
}

/** Integer division rounded half-to-even (banker's rounding), for non-negative operands. */
export function divideHalfEven(numerator: number, denominator: number): number {
  const quotient = Math.floor(numerator / denominator);
  const twiceRemainder = 2 * (numerator - quotient * denominator);
  if (twiceRemainder > denominator) return quotient + 1;
  if (twiceRemainder < denominator) return quotient;
  return quotient % 2 === 0 ? quotient : quotient + 1;
}

/** "12,5" / "12.5" / "10" → basis points (1250 / 1000), or null. Up to two decimals, 0–1000%. */
export function parsePercentToBasisPoints(input: string): number | null {
  const s = input.replace(/%|\s/g, "").replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, fraction = ""] = s.split(".");
  const bp = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return bp <= 100_000 ? bp : null;
}

/** Percentage of an amount in cents, rounded half-to-even: 10% of R$ 3.333,35 → R$ 333,34. */
export function percentOf(cents: number, basisPoints: number): number {
  return divideHalfEven(cents * basisPoints, 10_000);
}
