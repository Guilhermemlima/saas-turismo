/** Calendar date (YYYY-MM-DD) "today" in the given IANA time zone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });

/** "17 dez" (pt-BR would render "17 de dez."). */
function dayMonth(date: Date): string {
  const parts = shortDate.formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = (parts.find((p) => p.type === "month")?.value ?? "").replace(".", "");
  return `${day} ${month}`;
}
const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** "10–17 dez", "10 dez – 3 jan", "dezembro de 2026" or null. */
export function formatTripDates(departure: string | null, returnDate: string | null, travelMonth: string | null): string | null {
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
  if (departure && returnDate) {
    const a = d(departure);
    const b = d(returnDate);
    const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
    return sameMonth
      ? `${String(a.getUTCDate()).padStart(2, "0")}–${dayMonth(b)}`
      : `${dayMonth(a)} – ${dayMonth(b)}`;
  }
  if (departure) return `a partir de ${dayMonth(d(departure))}`;
  if (travelMonth) return monthYear.format(d(travelMonth));
  return null;
}
