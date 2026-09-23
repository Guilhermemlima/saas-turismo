import { z } from "zod";

import {
  checkbox,
  optionalBrazilState,
  optionalEmail,
  optionalPhone,
  optionalText,
  optionalUuid,
  requiredText,
} from "@/lib/form-fields";
import type { CustomerSource } from "@/server/db/database.types";

export const CUSTOMER_SOURCES = [
  "manual",
  "whatsapp",
  "instagram",
  "website",
  "referral",
  "import",
  "other",
] as const satisfies readonly CustomerSource[];

export const CUSTOMER_SOURCE_LABELS: Record<CustomerSource, string> = {
  manual: "Cadastro manual",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  website: "Site",
  referral: "Indicação",
  import: "Importação",
  other: "Outro",
};

const birthDateField = optionalText(10, "Data de nascimento").transform((value, ctx) => {
  if (value === null) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: "Data inválida." });
    return z.NEVER;
  }
  if (date > new Date() || date.getUTCFullYear() < 1900) {
    ctx.addIssue({ code: "custom", message: "Data de nascimento fora do intervalo permitido." });
    return z.NEVER;
  }
  return value;
});

export const customerInputSchema = z
  .object({
    full_name: requiredText(2, 120, "Nome"),
    phone_e164: optionalPhone(),
    email: optionalEmail(),
    city: optionalText(120, "Cidade"),
    state: optionalBrazilState(),
    birth_date: birthDateField,
    source: z.preprocess((v) => (v === "" || v == null ? "manual" : v), z.enum(CUSTOMER_SOURCES, "Origem inválida.")),
    owner_member_id: optionalUuid("Consultor"),
    notes: optionalText(2000, "Observações"),
    marketing_opt_in: checkbox(),
  })
  .superRefine((data, ctx) => {
    if (!data.phone_e164 && !data.email) {
      ctx.addIssue({ code: "custom", path: ["phone_e164"], message: "Informe telefone ou e-mail." });
    }
  });

export type CustomerInput = z.infer<typeof customerInputSchema>;

export const CUSTOMERS_PAGE_SIZE = 20;

export const customerListQuerySchema = z.object({
  q: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().trim().max(100).catch("")),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  status: z.enum(["active", "archived"]).catch("active"),
});

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
