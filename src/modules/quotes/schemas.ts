import { z } from "zod";

import { isIsoDate } from "@/lib/dates";
import { checkbox, optionalText, optionalUuid, requiredText } from "@/lib/form-fields";
import { parseMoneyToCents } from "@/lib/money";

import { FLIGHT_CABINS, QUOTE_CURRENCIES, QUOTE_ITEM_TYPES, TRANSFER_KINDS } from "./labels";
import { parsePercentToBasisPoints, percentOf } from "./pricing";

const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Required-ish money: empty means zero. */
const money = (label: string) =>
  z.preprocess(asString, z.string()).transform((value, ctx) => {
    if (value === "") return 0;
    const cents = parseMoneyToCents(value);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: `${label}: valor inválido. Ex.: 1.250,00` });
      return z.NEVER;
    }
    return cents;
  });

/** Money or a percentage of the item cost ("10%"), resolved later against the cost. */
const moneyOrPercent = (label: string) =>
  z.preprocess(asString, z.string()).transform((value, ctx): { cents: number } | { basisPoints: number } => {
    if (value === "") return { cents: 0 };
    if (value.endsWith("%")) {
      const basisPoints = parsePercentToBasisPoints(value);
      if (basisPoints === null) {
        ctx.addIssue({ code: "custom", message: `${label}: percentual inválido. Ex.: 12,5%` });
        return z.NEVER;
      }
      return { basisPoints };
    }
    const cents = parseMoneyToCents(value);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: `${label}: use um valor (1.250,00) ou percentual do custo (10%).` });
      return z.NEVER;
    }
    return { cents };
  });

const optionalDate = (label: string) =>
  z.preprocess((v) => (asString(v) === "" ? null : asString(v)), z.string().refine(isIsoDate, `${label} inválida.`).nullable());

const optionalInt = (min: number, max: number, label: string) =>
  z.preprocess(
    (v) => (asString(v) === "" ? null : Number(asString(v))),
    z.number(`${label} inválido.`).int(`${label} deve ser inteiro.`).min(min, `${label}: mínimo ${min}.`).max(max, `${label}: máximo ${max}.`).nullable(),
  );

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess((v) => (asString(v) === "" ? null : asString(v)), z.enum(values, message).nullable());

// Quote ------------------------------------------------------------------------------------------------
export const quoteCreateSchema = z.object({
  deal_id: z.preprocess(asString, z.uuid("Selecione o negócio.")),
  title: requiredText(2, 120, "Título"),
  currency: z.preprocess((v) => asString(v) || "BRL", z.enum(QUOTE_CURRENCIES, "Moeda inválida.")),
});

export const quoteUpdateSchema = z.object({
  title: requiredText(2, 120, "Título"),
  currency: z.preprocess((v) => asString(v) || "BRL", z.enum(QUOTE_CURRENCIES, "Moeda inválida.")),
  assigned_member_id: optionalUuid("Consultor"),
  internal_notes: optionalText(4000, "Observações internas"),
});

export type QuoteUpdateInput = z.infer<typeof quoteUpdateSchema>;

// Option -----------------------------------------------------------------------------------------------
export const optionInputSchema = z.object({
  title: requiredText(1, 120, "Nome da opção"),
  description: optionalText(2000, "Descrição"),
  service_fee_cents: money("Taxa de serviço"),
  discount_cents: money("Desconto"),
});

export type OptionInput = z.infer<typeof optionInputSchema>;

// Item details: one shape per item type (stored in quote_items.details) ------------------------------------
const flightDetails = z.object({
  airline: optionalText(80, "Companhia"),
  route: optionalText(160, "Trecho"),
  flight_numbers: optionalText(80, "Voos"),
  cabin: optionalEnum(FLIGHT_CABINS, "Classe inválida."),
  baggage: optionalText(120, "Bagagem"),
  stops: optionalInt(0, 5, "Escalas"),
});

const hotelDetails = z.object({
  category: optionalInt(1, 5, "Categoria"),
  room_type: optionalText(120, "Tipo de quarto"),
  meal_plan: optionalEnum(["room_only", "breakfast", "half_board", "full_board", "all_inclusive"] as const, "Regime inválido."),
  rooms: optionalInt(1, 50, "Quartos"),
});

const transferDetails = z.object({
  from_place: optionalText(120, "Origem"),
  to_place: optionalText(120, "Destino"),
  transfer_kind: optionalEnum(TRANSFER_KINDS, "Tipo de transfer inválido."),
});

const tourDetails = z.object({
  location: optionalText(120, "Local"),
  duration: optionalText(60, "Duração"),
});

const insuranceDetails = z.object({
  plan: optionalText(120, "Plano"),
  coverage: optionalText(120, "Cobertura"),
});

export const ITEM_DETAILS_SCHEMAS = {
  flight: flightDetails,
  hotel: hotelDetails,
  transfer: transferDetails,
  tour: tourDetails,
  insurance: insuranceDetails,
  other: z.object({}),
} as const;

export type ItemDetails = {
  flight: z.infer<typeof flightDetails>;
  hotel: z.infer<typeof hotelDetails>;
  transfer: z.infer<typeof transferDetails>;
  tour: z.infer<typeof tourDetails>;
  insurance: z.infer<typeof insuranceDetails>;
  other: Record<string, never>;
};

/** Detail fields are posted with a "d_" prefix so they never clash with the common columns. */
export const DETAIL_PREFIX = "d_";

// Item -------------------------------------------------------------------------------------------------
const itemBaseSchema = z
  .object({
    item_type: z.preprocess(asString, z.enum(QUOTE_ITEM_TYPES, "Tipo de item inválido.")),
    title: requiredText(2, 160, "Descrição do item"),
    description: optionalText(2000, "Detalhes"),
    supplier_name: optionalText(120, "Fornecedor"),
    start_date: optionalDate("Data de início"),
    end_date: optionalDate("Data de fim"),
    quantity: z.preprocess(
      (v) => (asString(v) === "" ? 1 : Number(asString(v))),
      z.number("Quantidade inválida.").int("Quantidade deve ser inteira.").min(1, "Quantidade mínima: 1.").max(999, "Quantidade máxima: 999."),
    ),
    cost_cents: money("Custo"),
    markup: moneyOrPercent("Markup"),
    pass_through_fees_cents: money("Taxas"),
    commission: moneyOrPercent("Comissão"),
    show_price_to_customer: checkbox(),
  })
  .superRefine((data, ctx) => {
    if (data.start_date && data.end_date && data.end_date < data.start_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "O fim deve ser depois do início." });
    }
  });

export type ItemInput = {
  item_type: (typeof QUOTE_ITEM_TYPES)[number];
  title: string;
  description: string | null;
  supplier_name: string | null;
  start_date: string | null;
  end_date: string | null;
  quantity: number;
  cost_cents: number;
  markup_cents: number;
  pass_through_fees_cents: number;
  commission_cents: number;
  show_price_to_customer: boolean;
  details: Record<string, string | number>;
};

type ParseResult = { success: true; data: ItemInput } | { success: false; error: z.ZodError };

/** Validates the item form, resolves "%" amounts against the unit cost and keeps only filled details. */
export function parseItemForm(raw: Record<string, unknown>): ParseResult {
  const base = itemBaseSchema.safeParse(raw);
  if (!base.success) return base;

  const detailsRaw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith(DETAIL_PREFIX)) detailsRaw[key.slice(DETAIL_PREFIX.length)] = value;
  }
  const details = ITEM_DETAILS_SCHEMAS[base.data.item_type].safeParse(detailsRaw);
  if (!details.success) {
    // Report detail errors under their form field names.
    const issues = details.error.issues.map((issue) => ({ ...issue, path: [`${DETAIL_PREFIX}${String(issue.path[0])}`] }));
    return { success: false, error: new z.ZodError(issues) };
  }

  const { markup, commission, ...rest } = base.data;
  const resolve = (amount: { cents: number } | { basisPoints: number }) =>
    "cents" in amount ? amount.cents : percentOf(rest.cost_cents, amount.basisPoints);

  const compact: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(details.data)) {
    if (value !== null && value !== undefined) compact[key] = value as string | number;
  }

  return {
    success: true,
    data: { ...rest, markup_cents: resolve(markup), commission_cents: resolve(commission), details: compact },
  };
}

// List ---------------------------------------------------------------------------------------------------
export const QUOTES_PAGE_SIZE = 20;

export const quoteListQuerySchema = z.object({
  q: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().trim().max(100).catch("")),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  status: z.enum(["draft", "ready", "archived", "all"]).catch("draft"),
});

export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;
