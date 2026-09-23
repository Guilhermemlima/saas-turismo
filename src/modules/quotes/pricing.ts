/**
 * Pure mirror of the database pricing (migration 0014). The database is the authority; this is
 * used for the live preview in forms and is tested against the same examples.
 */
export type PricedLine = {
  quantity: number;
  unitCostCents: number;
  unitMarkupCents: number;
  unitFeesCents: number;
  commissionCents: number;
};

export function linePriceCents(line: Pick<PricedLine, "quantity" | "unitCostCents" | "unitMarkupCents" | "unitFeesCents">): number {
  return line.quantity * (line.unitCostCents + line.unitMarkupCents + line.unitFeesCents);
}

export type OptionTotals = {
  subtotalCents: number;
  costCents: number;
  markupCents: number;
  feesCents: number;
  commissionCents: number;
  totalCents: number;
  marginCents: number;
  /** Agency earnings: margin + supplier commissions. */
  grossProfitCents: number;
  /** Margin as a share of the customer total (0–1), or null for empty options. */
  marginRate: number | null;
};

export function optionTotals(lines: PricedLine[], serviceFeeCents: number, discountCents: number): OptionTotals {
  const sum = (fn: (l: PricedLine) => number) => lines.reduce((acc, l) => acc + fn(l), 0);
  const subtotalCents = sum(linePriceCents);
  const markupCents = sum((l) => l.quantity * l.unitMarkupCents);
  const totalCents = subtotalCents + serviceFeeCents - discountCents;
  const marginCents = markupCents + serviceFeeCents - discountCents;
  const commissionCents = sum((l) => l.commissionCents);
  return {
    subtotalCents,
    costCents: sum((l) => l.quantity * l.unitCostCents),
    markupCents,
    feesCents: sum((l) => l.quantity * l.unitFeesCents),
    commissionCents,
    totalCents,
    marginCents,
    grossProfitCents: marginCents + commissionCents,
    marginRate: totalCents > 0 ? marginCents / totalCents : null,
  };
}

/** Markup that reaches a target margin on the line price: markup = cost × pct / (1 − pct). */
export function markupForMarginPct(unitCostCents: number, unitFeesCents: number, marginPct: number): number {
  if (marginPct <= 0 || marginPct >= 100) return 0;
  const base = unitCostCents + unitFeesCents;
  return Math.round((base * marginPct) / (100 - marginPct));
}
