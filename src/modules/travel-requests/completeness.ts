import type { DateFlexibility } from "@/server/db/database.types";

/**
 * Deterministic checklist of what is still missing in a travel request. The future AI agent
 * receives this list instead of deciding by itself what to ask, and only the server decides
 * when a request is complete.
 */
export type CompletenessFields = {
  destination: string | null;
  origin_city: string | null;
  date_flexibility: DateFlexibility;
  departure_date: string | null;
  return_date: string | null;
  travel_month: string | null;
  adults: number | null;
  budget_cents: number | null;
  needs_flights: boolean;
  needs_hotel: boolean;
  needs_transfer: boolean;
  needs_insurance: boolean;
  needs_tours: boolean;
  hotel_category: number | null;
};

export type ChecklistItem = {
  key: "destination" | "dates" | "party" | "origin" | "services" | "budget" | "hotel_category";
  label: string;
  done: boolean;
  /** Essential items gate the "complete" status; the others improve the quote. */
  essential: boolean;
  hint?: string;
};

function datesDone(r: CompletenessFields): boolean {
  switch (r.date_flexibility) {
    case "exact":
      return Boolean(r.departure_date && r.return_date);
    case "flexible_days":
      return Boolean(r.departure_date);
    case "month_only":
      return Boolean(r.travel_month || r.departure_date);
    case "undecided":
      return false;
  }
}

export function travelRequestChecklist(r: CompletenessFields): ChecklistItem[] {
  const anyService = r.needs_flights || r.needs_hotel || r.needs_transfer || r.needs_insurance || r.needs_tours;
  const items: ChecklistItem[] = [
    { key: "destination", label: "Destino", done: Boolean(r.destination?.trim()), essential: true },
    {
      key: "dates",
      label: "Período da viagem",
      done: datesDone(r),
      essential: true,
      hint: r.date_flexibility === "exact" ? "Informe ida e volta." : undefined,
    },
    { key: "party", label: "Passageiros", done: (r.adults ?? 0) >= 1, essential: true, hint: "Ao menos 1 adulto." },
  ];
  if (r.needs_flights) {
    items.push({
      key: "origin",
      label: "Cidade de origem",
      done: Boolean(r.origin_city?.trim()),
      essential: true,
      hint: "Necessária para cotar aéreo.",
    });
  }
  items.push(
    { key: "services", label: "Serviços desejados", done: anyService, essential: false },
    { key: "budget", label: "Orçamento", done: r.budget_cents !== null, essential: false },
  );
  if (r.needs_hotel) {
    items.push({ key: "hotel_category", label: "Categoria do hotel", done: r.hotel_category !== null, essential: false });
  }
  return items;
}

export function isRequestComplete(r: CompletenessFields): boolean {
  return travelRequestChecklist(r).every((item) => !item.essential || item.done);
}

export function completionPercent(r: CompletenessFields): number {
  const items = travelRequestChecklist(r);
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}
