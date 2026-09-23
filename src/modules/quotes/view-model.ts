import { formatDate } from "@/lib/format";
import { MEAL_PLAN_LABELS } from "@/modules/travel-requests/labels";
import type { MealPlan } from "@/server/db/database.types";

import type { BuilderOption } from "./components/quote-builder";
import type { QuoteOption } from "./repository";
import { CABIN_LABELS } from "./schemas";

type Details = Record<string, string | number | undefined>;

/** One-line, human description of an item's type-specific details. */
export function itemSummary(type: string, details: Details): string {
  const parts: (string | undefined)[] = [];
  if (type === "flight") {
    if (details.origin && details.destination) parts.push(`${details.origin} → ${details.destination}`);
    if (details.flight_number) parts.push(String(details.flight_number));
    if (details.stops !== undefined) parts.push(Number(details.stops) === 0 ? "direto" : `${details.stops} escala(s)`);
    if (details.cabin) parts.push(CABIN_LABELS[details.cabin as keyof typeof CABIN_LABELS]);
    if (details.baggage) parts.push(String(details.baggage));
  } else if (type === "hotel") {
    if (details.category) parts.push(`${details.category}★`);
    if (details.room_type) parts.push(String(details.room_type));
    if (details.meal_plan) parts.push(MEAL_PLAN_LABELS[details.meal_plan as MealPlan]);
  } else if (type === "transfer") {
    parts.push(details.vehicle as string | undefined);
  } else if (type === "tour") {
    parts.push(details.duration as string | undefined, details.meeting_point as string | undefined);
  } else if (type === "insurance") {
    parts.push(details.coverage as string | undefined);
  }
  return parts.filter(Boolean).join(" · ");
}

export function itemDates(start: string | null, end: string | null): string | null {
  if (start && end && start !== end) return `${formatDate(start)} → ${formatDate(end)}`;
  if (start) return formatDate(start);
  return null;
}

export function toBuilderOptions(options: QuoteOption[]): BuilderOption[] {
  return options.map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description,
    service_fee_cents: o.service_fee_cents,
    discount_cents: o.discount_cents,
    items_price_cents: o.items_price_cents,
    items_cost_cents: o.items_cost_cents,
    commission_cents: o.commission_cents,
    total_cents: o.total_cents,
    margin_cents: o.margin_cents,
    items: o.items.map((i) => {
      const details = (i.details ?? {}) as Details;
      return {
        id: i.id,
        item_type: i.item_type,
        title: i.title,
        description: i.description,
        supplier_name: i.supplier_name,
        start_date: i.start_date,
        end_date: i.end_date,
        quantity: i.quantity,
        unit_cost_cents: i.unit_cost_cents,
        unit_markup_cents: i.unit_markup_cents,
        unit_fees_cents: i.unit_fees_cents,
        commission_cents: i.commission_cents,
        show_price_to_customer: i.show_price_to_customer,
        details,
        price_cents: i.price_cents,
        summary: itemSummary(i.item_type, details),
        dates: itemDates(i.start_date, i.end_date),
      };
    }),
  }));
}
