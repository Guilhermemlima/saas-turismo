import { z } from "zod";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: "Segunda",
  tue: "Terça",
  wed: "Quarta",
  thu: "Quinta",
  fri: "Sexta",
  sat: "Sábado",
  sun: "Domingo",
};

/** Brazilian IANA zones (agencies can be anywhere in the country). */
export const BRAZIL_TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (SP, RJ, MG, Sul, Nordeste…)" },
  { value: "America/Manaus", label: "Amazonas (Manaus)" },
  { value: "America/Cuiaba", label: "Mato Grosso (Cuiabá)" },
  { value: "America/Campo_Grande", label: "Mato Grosso do Sul" },
  { value: "America/Porto_Velho", label: "Rondônia" },
  { value: "America/Boa_Vista", label: "Roraima" },
  { value: "America/Rio_Branco", label: "Acre" },
  { value: "America/Noronha", label: "Fernando de Noronha" },
] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");

const daySchema = z
  .object({ open: z.boolean(), start: time, end: time })
  .refine((d) => !d.open || d.start < d.end, { message: "O fechamento deve ser depois da abertura.", path: ["end"] });

export const businessHoursSchema = z.object(Object.fromEntries(WEEKDAYS.map((d) => [d, daySchema])) as Record<Weekday, typeof daySchema>);

export type BusinessHours = z.infer<typeof businessHoursSchema>;

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  mon: { open: true, start: "09:00", end: "18:00" },
  tue: { open: true, start: "09:00", end: "18:00" },
  wed: { open: true, start: "09:00", end: "18:00" },
  thu: { open: true, start: "09:00", end: "18:00" },
  fri: { open: true, start: "09:00", end: "18:00" },
  sat: { open: true, start: "09:00", end: "13:00" },
  sun: { open: false, start: "09:00", end: "13:00" },
};

/** Stored JSON → hours; anything malformed falls back to the defaults (never throws on read). */
export function parseBusinessHours(value: unknown): BusinessHours {
  const parsed = businessHoursSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_BUSINESS_HOURS;
}

export function businessHoursFromForm(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(
    WEEKDAYS.map((d) => [
      d,
      { open: formData.get(`${d}_open`) === "on", start: String(formData.get(`${d}_start`) ?? ""), end: String(formData.get(`${d}_end`) ?? "") },
    ]),
  );
}

/** Whether the agency is open at `now` in its time zone (used later by the AI agent and follow-ups). */
export function isOpenAt(hours: BusinessHours, timeZone: string, now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value.toLowerCase().slice(0, 3) as Weekday;
  const hhmm = `${parts.find((p) => p.type === "hour")?.value}:${parts.find((p) => p.type === "minute")?.value}`;
  const day = hours[weekday];
  return Boolean(day?.open && hhmm >= day.start && hhmm < day.end);
}
