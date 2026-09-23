import { z } from "zod";

import { isIsoDate } from "@/lib/dates";
import { checkbox, optionalText, requiredText } from "@/lib/form-fields";
import { parseMoneyToCents } from "@/lib/money";
import { MEAL_PLANS } from "@/modules/travel-requests/labels";
import type { QuoteItemType } from "@/server/db/database.types";

export const QUOTE_ITEM_TYPES = ["flight", "hotel", "transfer", "tour", "insurance", "other"] as const satisfies readonly QuoteItemType[];

export const QUOTE_ITEM_LABELS: Record<QuoteItemType, string> = {
  flight: "Aéreo",
  hotel: "Hospedagem",
  transfer: "Transfer",
  tour: "Passeio",
  insurance: "Seguro viagem",
  other: "Outro",
};

export const CABINS = ["economy", "premium_economy", "business", "first"] as const;
export const CABIN_LABELS: Record<(typeof CABINS)[number], string> = {
  economy: "Econômica",
  premium_economy: "Premium economy",
  business: "Executiva",
  first: "Primeira classe",
};

export const CURRENCIES = ["BRL", "USD", "EUR"] as const;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const text = (max: number) => z.preprocess((v) => s(v) || undefined, z.string().max(max, `Máximo de ${max} caracteres.`).optional());
const dateTime = z.preprocess(
  (v) => s(v) || undefined,
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Data/hora inválida.").optional(),
);
const int = (min: number, max: number) =>
  z.preprocess((v) => (s(v) === "" ? undefined : Number(s(v))), z.number().int().min(min).max(max).optional());

/** Type-specific details (stored as JSONB). Unknown keys are dropped. */
export const itemDetailsSchemas = {
  flight: z.object({
    airline: text(80),
    flight_number: text(20),
    origin: text(80),
    destination: text(80),
    departure_at: dateTime,
    arrival_at: dateTime,
    return_departure_at: dateTime,
    stops: int(0, 5),
    cabin: z.preprocess((v) => s(v) || undefined, z.enum(CABINS).optional()),
    baggage: text(120),
  }),
  hotel: z.object({
    hotel_name: text(120),
    category: int(1, 5),
    room_type: text(120),
    meal_plan: z.preprocess((v) => s(v) || undefined, z.enum(MEAL_PLANS).optional()),
  }),
  transfer: z.object({ route: text(160), vehicle: text(80) }),
  tour: z.object({ duration: text(80), meeting_point: text(160) }),
  insurance: z.object({ plan: text(120), coverage: text(200) }),
  other: z.object({}),
} satisfies Record<QuoteItemType, z.ZodType>;

export type ItemDetails = { [K in QuoteItemType]: z.infer<(typeof itemDetailsSchemas)[K]> };

const money = (label: string) =>
  z.preprocess(s, z.string()).transform((value, ctx) => {
    if (value === "") return 0;
    const cents = parseMoneyToCents(value);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: `${label}: valor inválido.` });
      return z.NEVER;
    }
    return cents;
  });

export const quoteItemInputSchema = z
  .object({
    item_type: z.enum(QUOTE_ITEM_TYPES, "Tipo de item inválido."),
    title: optionalText(160, "Título"),
    description: optionalText(2000, "Descrição"),
    supplier_name: optionalText(120, "Fornecedor"),
    start_date: z.preprocess((v) => s(v) || null, z.string().refine(isIsoDate, "Data inválida.").nullable()),
    end_date: z.preprocess((v) => s(v) || null, z.string().refine(isIsoDate, "Data inválida.").nullable()),
    quantity: z.preprocess((v) => (s(v) === "" ? 1 : Number(s(v))), z.number("Quantidade inválida.").int().min(1, "Mínimo 1.").max(999, "Máximo 999.")),
    unit_cost_cents: money("Custo"),
    unit_markup_cents: money("Markup"),
    unit_fees_cents: money("Taxas"),
    commission_cents: money("Comissão"),
    show_price_to_customer: checkbox(),
  })
  .superRefine((data, ctx) => {
    if (data.start_date && data.end_date && data.end_date < data.start_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "A data final deve ser depois da inicial." });
    }
  });

export type QuoteItemInput = z.infer<typeof quoteItemInputSchema>;

/** Builds a readable title when the consultant leaves it blank, e.g. "LATAM · Recife → Maceió". */
export function autoItemTitle(type: QuoteItemType, details: Record<string, unknown>): string {
  const d = details as Record<string, string | number | undefined>;
  const join = (...parts: (string | number | undefined)[]) => parts.filter(Boolean).join(" · ");
  switch (type) {
    case "flight":
      return join(d.airline as string, d.origin && d.destination ? `${d.origin} → ${d.destination}` : undefined) || "Passagem aérea";
    case "hotel":
      return join(d.hotel_name as string, d.room_type as string) || "Hospedagem";
    case "transfer":
      return (d.route as string) || "Transfer";
    case "tour":
      return "Passeio";
    case "insurance":
      return join("Seguro", d.plan as string);
    default:
      return "Item";
  }
}

export const optionInputSchema = z.object({
  title: requiredText(1, 120, "Nome da opção"),
  description: optionalText(2000, "Descrição"),
  service_fee_cents: money("Taxa de serviço"),
  discount_cents: money("Desconto"),
});

export const quoteHeaderSchema = z.object({
  title: requiredText(2, 160, "Título"),
  currency: z.enum(CURRENCIES, "Moeda inválida."),
  internal_notes: optionalText(4000, "Notas"),
});

export const quoteListQuerySchema = z.object({
  status: z.enum(["draft", "ready", "archived", "open"]).catch("open"),
});
