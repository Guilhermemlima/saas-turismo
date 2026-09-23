import { z } from "zod";

import { normalizeCnpj, normalizeInstagram, normalizeWebsite } from "@/lib/cnpj";
import { optionalBrazilState, optionalEmail, optionalPhone, optionalText, requiredText } from "@/lib/form-fields";
import { TRIP_SCOPES, TRIP_TYPES } from "@/modules/travel-requests/labels";

export const agencyCreateSchema = z.object({
  name: requiredText(2, 120, "Nome da agência"),
  phone_e164: optionalPhone(),
  email: optionalEmail(),
  city: optionalText(120, "Cidade"),
  state: optionalBrazilState(),
});

export type AgencyCreateInput = z.infer<typeof agencyCreateSchema>;

const normalized = (label: string, fn: (v: string) => string | null, message: string) =>
  optionalText(300, label).transform((value, ctx) => {
    if (value === null) return null;
    const result = fn(value);
    if (result === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return result;
  });

export const agencyProfileSchema = agencyCreateSchema.extend({
  cnpj: normalized("CNPJ", normalizeCnpj, "CNPJ inválido."),
  website: normalized("Site", normalizeWebsite, "Site inválido. Ex.: www.suaagencia.com.br"),
  instagram: normalized("Instagram", normalizeInstagram, "Perfil inválido. Ex.: @suaagencia"),
});

export type AgencyProfileInput = z.infer<typeof agencyProfileSchema>;

export const specialtiesSchema = z.object({
  specialties: z.array(z.enum(TRIP_TYPES, "Especialidade inválida.")).max(TRIP_TYPES.length),
  specialty_scopes: z.array(z.enum(TRIP_SCOPES, "Abrangência inválida.")).max(TRIP_SCOPES.length),
});

export const LOGO_MAX_BYTES = 1024 * 1024;
