import type { TaskRow } from "./components/task-components";
import type { TaskListItem } from "./repository";

/** Server-side mapping to display-ready rows (dates already in the agency time zone). */
export function toTaskRows(tasks: TaskListItem[], timeZone: string, now: Date = new Date()): TaskRow[] {
  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.task_type,
    status: t.status,
    priority: t.priority,
    dueLabel: t.due_at ? fmt.format(new Date(t.due_at)) : null,
    overdue: Boolean(t.due_at && new Date(t.due_at) < now),
    assigneeName: t.assigned?.display_name || t.assigned?.profile?.full_name || null,
    customer: t.customer ? { id: t.customer.id, name: t.customer.full_name } : null,
  }));
}
