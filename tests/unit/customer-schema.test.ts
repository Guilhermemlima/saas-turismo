import { describe, expect, it } from "vitest";

import { customerInputSchema, customerListQuerySchema } from "@/modules/customers/schemas";

const base = { full_name: "João Silva", phone_e164: "(82) 99999-0001" };

describe("customerInputSchema", () => {
  it("normalizes a Brazilian phone to E.164 and fills defaults", () => {
    const result = customerInputSchema.parse(base);
    expect(result).toMatchObject({
      full_name: "João Silva",
      phone_e164: "+5582999990001",
      email: null,
      city: null,
      state: null,
      source: "manual",
      owner_member_id: null,
      marketing_opt_in: false,
    });
  });

  it("requires phone or e-mail", () => {
    const result = customerInputSchema.safeParse({ full_name: "Maria" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["phone_e164"]);
  });

  it("accepts e-mail only and lowercases it", () => {
    const result = customerInputSchema.parse({ full_name: "Maria", email: "  Maria@Email.COM " });
    expect(result.email).toBe("maria@email.com");
    expect(result.phone_e164).toBeNull();
  });

  it.each([
    ["phone_e164", "123"],
    ["email", "not-an-email"],
    ["state", "XX"],
    ["birth_date", "2999-01-01"],
    ["birth_date", "31/12/1990"],
    ["source", "tiktok"],
    ["owner_member_id", "not-a-uuid"],
  ])("rejects invalid %s (%s)", (field, value) => {
    const result = customerInputSchema.safeParse({ ...base, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === field)).toBe(true);
  });

  it("rejects names that are too short or too long", () => {
    expect(customerInputSchema.safeParse({ ...base, full_name: "J" }).success).toBe(false);
    expect(customerInputSchema.safeParse({ ...base, full_name: "x".repeat(121) }).success).toBe(false);
  });

  it("parses the marketing checkbox and uppercases the state", () => {
    const result = customerInputSchema.parse({ ...base, marketing_opt_in: "on", state: "al" });
    expect(result.marketing_opt_in).toBe(true);
    expect(result.state).toBe("AL");
  });

  it("ignores unknown fields such as a forged agency_id", () => {
    const result = customerInputSchema.parse({ ...base, agency_id: "00000000-0000-0000-0000-000000000000" });
    expect(result).not.toHaveProperty("agency_id");
  });
});

describe("customerListQuerySchema", () => {
  it("falls back to safe defaults for garbage input", () => {
    expect(customerListQuerySchema.parse({ page: "-3", status: "deleted", q: ["a", "b"] })).toEqual({
      q: "",
      page: 1,
      status: "active",
    });
  });

  it("trims the search term and accepts archived", () => {
    expect(customerListQuerySchema.parse({ q: "  ana  ", page: "2", status: "archived" })).toEqual({
      q: "ana",
      page: 2,
      status: "archived",
    });
  });
});
