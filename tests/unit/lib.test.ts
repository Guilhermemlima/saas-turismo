import { describe, expect, it } from "vitest";

import { readPublicEnv } from "@/lib/env";
import { formatDate, initials } from "@/lib/format";
import { permissionsFor, roleCan } from "@/lib/permissions";
import { formatPhone, toE164 } from "@/lib/phone";
import { isPublicPath, safeNextPath } from "@/lib/routes";

describe("phone", () => {
  it("normalizes common Brazilian formats", () => {
    expect(toE164("(82) 99999-0001")).toBe("+5582999990001");
    expect(toE164("+55 11 3333-4444")).toBe("+551133334444");
    expect(toE164("abc")).toBeNull();
  });

  it("formats Brazilian numbers nationally", () => {
    expect(formatPhone("+5582999990001")).toBe("(82) 99999-0001");
    expect(formatPhone(null)).toBe("");
  });
});

describe("permissions", () => {
  it("owners can do everything; attendants cannot see margins or archive", () => {
    expect(roleCan("owner", "agency.manage")).toBe(true);
    expect(roleCan("manager", "agency.manage")).toBe(false);
    expect(roleCan("attendant", "customers.write")).toBe(true);
    expect(roleCan("attendant", "customers.archive")).toBe(false);
    expect(roleCan("attendant", "quotes.view_margin")).toBe(false);
  });

  it("financial role handles payments but not conversations", () => {
    const perms = permissionsFor("financial");
    expect(perms.has("payments.write")).toBe(true);
    expect(perms.has("conversations.read")).toBe(false);
  });
});

describe("routes", () => {
  it("treats only explicit paths as public", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/proposal/abc")).toBe(true);
    expect(isPublicPath("/loginx")).toBe(false);
    expect(isPublicPath("/customers")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
  });

  it("blocks open redirects", () => {
    expect(safeNextPath("/customers?q=a")).toBe("/customers?q=a");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
    expect(safeNextPath("/ok\\..\\evil")).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
  });
});

describe("env", () => {
  it("returns null when Supabase is not configured", () => {
    expect(readPublicEnv({})).toBeNull();
  });

  it("parses a valid configuration", () => {
    const env = readPublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    });
    expect(env?.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });
});

describe("format", () => {
  it("builds initials", () => {
    expect(initials("João da Silva")).toBe("JS");
    expect(initials("Ana")).toBe("A");
    expect(initials("  ")).toBe("?");
  });

  it("formats plain dates without timezone shift", () => {
    expect(formatDate("2026-12-10")).toContain("10");
    expect(formatDate(null)).toBe("—");
  });
});
