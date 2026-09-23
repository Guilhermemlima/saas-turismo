const MAX_CENTS = 100_000_000_000; // R$ 1 bilhão: sanity cap for manual input

/**
 * Parses Brazilian-style amounts: "8.000", "8000", "8.000,50", "R$ 7.650,00", "7650.5".
 * Returns integer cents, or null when the input is empty/invalid.
 */
export function parseMoneyToCents(input: string): number | null {
  let s = input.replace(/R\$|\s/gi, "");
  if (s === "") return null;
  if (!/^\d[\d.,]*$/.test(s)) return null;

  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;

  const cents = Math.round(Number(s) * 100);
  return Number.isFinite(cents) && cents <= MAX_CENTS ? cents : null;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(cents: number | null | undefined, currency = "BRL"): string {
  if (cents == null) return "—";
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 });
    formatters.set(currency, formatter);
  }
  return formatter.format(cents / 100);
}

/** Value for a text input: 800050 → "8.000,50". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
}
