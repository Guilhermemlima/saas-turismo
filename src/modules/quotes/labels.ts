import type { QuoteItemType, QuoteStatus } from "@/server/db/database.types";

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Em montagem",
  ready: "Pronta",
  archived: "Arquivada",
};

export const QUOTE_ITEM_TYPES = ["flight", "hotel", "transfer", "tour", "insurance", "other"] as const satisfies readonly QuoteItemType[];

export const QUOTE_ITEM_TYPE_LABELS: Record<QuoteItemType, string> = {
  flight: "Aéreo",
  hotel: "Hospedagem",
  transfer: "Transfer",
  tour: "Passeio",
  insurance: "Seguro viagem",
  other: "Outro",
};

/** One currency per quote (D14). */
export const QUOTE_CURRENCIES = ["BRL", "USD", "EUR"] as const;
export type QuoteCurrency = (typeof QUOTE_CURRENCIES)[number];

export const QUOTE_CURRENCY_LABELS: Record<QuoteCurrency, string> = {
  BRL: "Real (R$)",
  USD: "Dólar (US$)",
  EUR: "Euro (€)",
};

export const FLIGHT_CABINS = ["economy", "premium_economy", "business", "first"] as const;
export const FLIGHT_CABIN_LABELS: Record<(typeof FLIGHT_CABINS)[number], string> = {
  economy: "Econômica",
  premium_economy: "Premium economy",
  business: "Executiva",
  first: "Primeira classe",
};

export const TRANSFER_KINDS = ["private", "shared"] as const;
export const TRANSFER_KIND_LABELS: Record<(typeof TRANSFER_KINDS)[number], string> = {
  private: "Privativo",
  shared: "Compartilhado",
};

const MEAL_PLAN_SHORT: Record<string, string> = {
  room_only: "Só hospedagem",
  breakfast: "Café da manhã",
  half_board: "Meia pensão",
  full_board: "Pensão completa",
  all_inclusive: "All inclusive",
};

/** One-line summary of the type-specific details: "LATAM · GRU → MCZ · Econômica · 1 escala". */
export function itemDetailsSummary(type: QuoteItemType, details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const d = details as Record<string, unknown>;
  const text = (key: string) => (typeof d[key] === "string" && d[key] ? (d[key] as string) : null);
  const num = (key: string) => (typeof d[key] === "number" ? (d[key] as number) : null);

  let parts: (string | null)[] = [];
  switch (type) {
    case "flight": {
      const stops = num("stops");
      const cabin = text("cabin");
      parts = [
        text("airline"),
        text("route"),
        text("flight_numbers"),
        cabin ? (FLIGHT_CABIN_LABELS[cabin as keyof typeof FLIGHT_CABIN_LABELS] ?? null) : null,
        stops === null ? null : stops === 0 ? "Direto" : `${stops} escala${stops > 1 ? "s" : ""}`,
        text("baggage"),
      ];
      break;
    }
    case "hotel": {
      const category = num("category");
      const rooms = num("rooms");
      const meal = text("meal_plan");
      parts = [
        category ? `${category}★` : null,
        text("room_type"),
        rooms ? `${rooms} quarto${rooms > 1 ? "s" : ""}` : null,
        meal ? (MEAL_PLAN_SHORT[meal] ?? null) : null,
      ];
      break;
    }
    case "transfer": {
      const from = text("from_place");
      const to = text("to_place");
      const kind = text("transfer_kind");
      parts = [from && to ? `${from} → ${to}` : (from ?? to), kind ? (TRANSFER_KIND_LABELS[kind as keyof typeof TRANSFER_KIND_LABELS] ?? null) : null];
      break;
    }
    case "tour":
      parts = [text("location"), text("duration")];
      break;
    case "insurance":
      parts = [text("plan"), text("coverage")];
      break;
    default:
      parts = [];
  }
  const summary = parts.filter(Boolean).join(" · ");
  return summary || null;
}
