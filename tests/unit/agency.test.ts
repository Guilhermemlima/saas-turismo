import { describe, expect, it } from "vitest";

import { formatCnpj, normalizeCnpj, normalizeInstagram, normalizeWebsite } from "@/lib/cnpj";
import {
  businessHoursSchema,
  DEFAULT_BUSINESS_HOURS,
  isOpenAt,
  parseBusinessHours,
} from "@/modules/agencies/business-hours";

describe("cnpj", () => {
  it("accepts valid CNPJs with or without mask", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizeCnpj("11222333000181")).toBe("11222333000181");
  });

  it.each(["11.222.333/0001-82", "00000000000000", "123", "11111111111111"])("rejects %s", (value) => {
    expect(normalizeCnpj(value)).toBeNull();
  });

  it("formats 14 digits", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("website and instagram", () => {
  it.each([
    ["agenciasol.com.br", "https://agenciasol.com.br"],
    ["https://www.agenciasol.com.br/", "https://www.agenciasol.com.br"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeWebsite(input)).toBe(expected);
  });

  it.each(["javascript:alert(1)", "ftp://x.com", "localhost", "não é site"])("rejects %s", (input) => {
    expect(normalizeWebsite(input)).toBeNull();
  });

  it.each([
    ["@AgenciaSol", "agenciasol"],
    ["https://instagram.com/agencia.sol/", "agencia.sol"],
    ["agencia_sol", "agencia_sol"],
  ])("normalizes instagram %s", (input, expected) => {
    expect(normalizeInstagram(input)).toBe(expected);
  });

  it("rejects invalid handles", () => {
    expect(normalizeInstagram("<script>")).toBeNull();
  });
});

describe("business hours", () => {
  it("defaults are valid", () => {
    expect(businessHoursSchema.safeParse(DEFAULT_BUSINESS_HOURS).success).toBe(true);
  });

  it("rejects closing before opening and malformed times", () => {
    const bad = { ...DEFAULT_BUSINESS_HOURS, mon: { open: true, start: "18:00", end: "09:00" } };
    expect(businessHoursSchema.safeParse(bad).success).toBe(false);
    const malformed = { ...DEFAULT_BUSINESS_HOURS, tue: { open: true, start: "9h", end: "18:00" } };
    expect(businessHoursSchema.safeParse(malformed).success).toBe(false);
  });

  it("falls back to defaults for empty stored JSON", () => {
    expect(parseBusinessHours({})).toEqual(DEFAULT_BUSINESS_HOURS);
  });

  it("checks opening hours in the agency time zone", () => {
    // Monday 2026-09-21 12:00 in São Paulo = 15:00 UTC
    expect(isOpenAt(DEFAULT_BUSINESS_HOURS, "America/Sao_Paulo", new Date("2026-09-21T15:00:00Z"))).toBe(true);
    // Monday 20:00 in São Paulo
    expect(isOpenAt(DEFAULT_BUSINESS_HOURS, "America/Sao_Paulo", new Date("2026-09-21T23:00:00Z"))).toBe(false);
    // Sunday closed
    expect(isOpenAt(DEFAULT_BUSINESS_HOURS, "America/Sao_Paulo", new Date("2026-09-20T15:00:00Z"))).toBe(false);
  });
});
