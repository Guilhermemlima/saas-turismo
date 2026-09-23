/** Validates a CNPJ (digits only or formatted) including both check digits. Returns the 14 digits or null. */
export function normalizeCnpj(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return null;

  const checkDigit = (base: string) => {
    const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const first = checkDigit(digits.slice(0, 12));
  const second = checkDigit(digits.slice(0, 12) + first);
  return digits.endsWith(`${first}${second}`) ? digits : null;
}

export function formatCnpj(digits: string | null | undefined): string {
  if (!digits || digits.length !== 14) return digits ?? "";
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/** "www.site.com.br" → "https://www.site.com.br"; rejects non-http(s) schemes. */
export function normalizeWebsite(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** "@agencia", "instagram.com/agencia/" or "agencia" → "agencia". */
export function normalizeInstagram(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const handle = raw
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  return /^[a-z0-9._]{1,30}$/i.test(handle) ? handle.toLowerCase() : null;
}
