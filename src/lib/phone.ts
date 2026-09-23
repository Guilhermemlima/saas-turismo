import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Normalizes user input to E.164 (default country Brazil). Returns null when invalid. */
export function toE164(input: string, defaultCountry: "BR" = "BR"): string | null {
  const phone = parsePhoneNumberFromString(input.trim(), defaultCountry);
  if (!phone || !phone.isValid()) return null;
  return phone.number;
}

/** Human-friendly display, e.g. "+55 82 99999-0001" → "(82) 99999-0001" for Brazilian numbers. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const phone = parsePhoneNumberFromString(e164);
  if (!phone) return e164;
  return phone.country === "BR" ? phone.formatNational() : phone.formatInternational();
}
