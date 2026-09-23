import { z } from "zod";

import { BRAZIL_STATES } from "./brazil";
import { toE164 } from "./phone";

/** FormData fields arrive as string | null. These helpers normalize them to typed values. */

const asString = (value: unknown) => (typeof value === "string" ? value : "");

export const requiredText = (min: number, max: number, label: string) =>
  z.preprocess(
    asString,
    z
      .string()
      .trim()
      .min(min, `${label} deve ter ao menos ${min} caracteres.`)
      .max(max, `${label} deve ter no máximo ${max} caracteres.`),
  );

/** Empty string becomes null. */
export const optionalText = (max: number, label: string) =>
  z.preprocess(
    asString,
    z
      .string()
      .trim()
      .max(max, `${label} deve ter no máximo ${max} caracteres.`)
      .transform((v) => (v === "" ? null : v)),
  );

export const checkbox = () => z.preprocess((value) => value === "on" || value === "true", z.boolean());

export const optionalUuid = (label: string) =>
  z.preprocess(
    asString,
    z.union([z.literal("").transform(() => null), z.uuid(`${label} inválido.`)]),
  );

/** Optional Brazilian-default phone, normalized to E.164. */
export const optionalPhone = (label = "Telefone") =>
  optionalText(30, label).transform((value, ctx) => {
    if (value === null) return null;
    const e164 = toE164(value);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: `${label} inválido. Use DDD + número, ex.: (82) 99999-0001.` });
      return z.NEVER;
    }
    return e164;
  });

export const optionalEmail = (label = "E-mail") =>
  optionalText(254, label).pipe(z.union([z.null(), z.email(`${label} inválido.`).transform((v) => v.toLowerCase())]));

export const optionalBrazilState = () =>
  optionalText(2, "UF").transform((value, ctx) => {
    if (value === null) return null;
    const upper = value.toUpperCase();
    if (!(BRAZIL_STATES as readonly string[]).includes(upper)) {
      ctx.addIssue({ code: "custom", message: "UF inválida." });
      return z.NEVER;
    }
    return upper;
  });
