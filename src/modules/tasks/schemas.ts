import { z } from "zod";

import { optionalText, optionalUuid, requiredText } from "@/lib/form-fields";
import type { TaskPriority, TaskType } from "@/server/db/database.types";

export const TASK_TYPES = [
  "prepare_quote",
  "research_hotel",
  "send_proposal",
  "call_customer",
  "follow_up",
  "confirm_payment",
  "send_voucher",
  "check_in",
  "post_sale",
  "other",
] as const satisfies readonly TaskType[];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  prepare_quote: "Preparar cotação",
  research_hotel: "Pesquisar hotel",
  send_proposal: "Enviar proposta",
  call_customer: "Ligar para o cliente",
  follow_up: "Follow-up",
  confirm_payment: "Confirmar pagamento",
  send_voucher: "Enviar voucher",
  check_in: "Fazer check-in",
  post_sale: "Pós-venda",
  other: "Outra",
};

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const satisfies readonly TaskPriority[];
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" };

/** `datetime-local` value ("2026-12-01T14:30") interpreted in the agency time zone offset sent by the form. */
const dueAt = z.preprocess(
  (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Data inválida.").nullable(),
);

export const taskInputSchema = z.object({
  title: requiredText(2, 160, "Título"),
  description: optionalText(2000, "Descrição"),
  task_type: z.preprocess((v) => (v === "" || v == null ? "other" : v), z.enum(TASK_TYPES, "Tipo inválido.")),
  priority: z.preprocess((v) => (v === "" || v == null ? "normal" : v), z.enum(TASK_PRIORITIES, "Prioridade inválida.")),
  due_local: dueAt,
  assigned_member_id: optionalUuid("Responsável"),
  customer_id: optionalUuid("Cliente"),
  deal_id: optionalUuid("Negócio"),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskListQuerySchema = z.object({
  view: z.enum(["mine", "all", "overdue", "done"]).catch("mine"),
});

/**
 * Converts a wall-clock time in an IANA zone to an ISO instant, without extra dependencies:
 * start from the naive UTC guess and correct by the zone offset at that instant.
 */
export function zonedLocalToIso(local: string, timeZone: string): string {
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asZoned = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asZoned - guess)).toISOString();
}

/** ISO instant → `datetime-local` value in the agency zone. */
export function isoToZonedLocal(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
