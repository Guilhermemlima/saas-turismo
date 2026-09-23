import { z } from "zod";

import { isIsoDate } from "@/lib/dates";
import { optionalText, optionalUuid } from "@/lib/form-fields";
import { parseMoneyToCents } from "@/lib/money";

import { BUDGET_SCOPES, DATE_FLEXIBILITIES, MEAL_PLANS, TRIP_SCOPES, TRIP_TYPES } from "./labels";

const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess((v) => (asString(v) === "" ? null : asString(v)), z.enum(values, message).nullable());

const optionalInt = (min: number, max: number, label: string) =>
  z.preprocess(
    (v) => (asString(v) === "" ? null : Number(asString(v))),
    z
      .number(`${label} inválido.`)
      .int(`${label} deve ser inteiro.`)
      .min(min, `${label}: mínimo ${min}.`)
      .max(max, `${label}: máximo ${max}.`)
      .nullable(),
  );

const optionalDate = (label: string) =>
  z.preprocess((v) => (asString(v) === "" ? null : asString(v)), z.string().refine(isIsoDate, `${label} inválida.`).nullable());

/** "2026-12" (input type=month) → "2026-12-01". */
const optionalMonth = z.preprocess(
  (v) => (asString(v) === "" ? null : asString(v)),
  z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido.")
    .transform((m) => `${m}-01`)
    .nullable(),
);

/** "4, 9" or "4 e 9" → [4, 9]. */
const childrenAges = z.preprocess(
  (v) =>
    asString(v)
      .split(/[,;\s]+|\be\b/i)
      .map((part) => part.trim())
      .filter(Boolean),
  z
    .array(z.coerce.number().int("Idade deve ser um número inteiro.").min(0, "Idade mínima: 0.").max(17, "Crianças têm até 17 anos."))
    .max(20, "Máximo de 20 crianças."),
);

const budget = z.preprocess(asString, z.string()).transform((value, ctx) => {
  if (value === "") return null;
  const cents = parseMoneyToCents(value);
  if (cents === null) {
    ctx.addIssue({ code: "custom", message: "Valor inválido. Ex.: 8.000 ou 8.000,50" });
    return z.NEVER;
  }
  return cents;
});

const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());

export const travelRequestInputSchema = z
  .object({
    destination: optionalText(160, "Destino"),
    origin_city: optionalText(120, "Origem"),
    trip_scope: optionalEnum(TRIP_SCOPES, "Tipo de destino inválido."),
    trip_types: z.array(z.enum(TRIP_TYPES, "Tipo de viagem inválido.")).max(TRIP_TYPES.length).default([]),
    date_flexibility: z.preprocess((v) => asString(v) || "undecided", z.enum(DATE_FLEXIBILITIES, "Opção de datas inválida.")),
    departure_date: optionalDate("Data de ida"),
    return_date: optionalDate("Data de volta"),
    travel_month: optionalMonth,
    adults: optionalInt(1, 99, "Adultos"),
    children_ages: childrenAges,
    infants: z.preprocess(
      (v) => (asString(v) === "" ? 0 : Number(asString(v))),
      z.number("Bebês inválido.").int().min(0).max(20, "Bebês: máximo 20."),
    ),
    budget_cents: budget,
    budget_scope: optionalEnum(BUDGET_SCOPES, "Tipo de orçamento inválido."),
    needs_flights: checkbox,
    needs_hotel: checkbox,
    needs_transfer: checkbox,
    needs_insurance: checkbox,
    needs_tours: checkbox,
    hotel_category: optionalInt(1, 5, "Categoria do hotel"),
    rooms: optionalInt(1, 50, "Quartos"),
    meal_plan: optionalEnum(MEAL_PLANS, "Regime inválido."),
    special_requests: optionalText(2000, "Pedidos especiais"),
    notes: optionalText(4000, "Observações"),
    assigned_member_id: optionalUuid("Consultor"),
  })
  .superRefine((data, ctx) => {
    if (data.departure_date && data.return_date && data.return_date < data.departure_date) {
      ctx.addIssue({ code: "custom", path: ["return_date"], message: "A volta deve ser depois da ida." });
    }
  })
  .transform((data) => ({
    ...data,
    budget_scope: data.budget_cents !== null ? (data.budget_scope ?? "total") : null,
  }));

export type TravelRequestInput = z.infer<typeof travelRequestInputSchema>;

/** Collects multi-value fields (checkbox groups) that a plain key/value copy would collapse. */
export function travelRequestFormToObject(formData: FormData): Record<string, unknown> {
  const object: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION") || typeof value !== "string") continue;
    object[key] = value;
  }
  object.trip_types = formData.getAll("trip_types").filter((v): v is string => typeof v === "string");
  return object;
}

export const REQUESTS_PAGE_SIZE = 20;

export const requestListQuerySchema = z.object({
  q: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().trim().max(100).catch("")),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  status: z.enum(["open", "collecting", "complete", "all"]).catch("open"),
});

export type RequestListQuery = z.infer<typeof requestListQuerySchema>;
