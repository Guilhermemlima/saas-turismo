"use client";

import { Check, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";

import { FormField, NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus, TaskType } from "@/server/db/database.types";

import { createTaskAction, deleteTaskAction, setTaskStatusAction } from "../actions";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_TYPE_LABELS, TASK_TYPES } from "../schemas";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  dueLabel: string | null;
  overdue: boolean;
  assigneeName: string | null;
  customer: { id: string; name: string } | null;
};

export function TaskForm({
  members,
  customers,
  fixedCustomerId,
  defaultAssigneeId,
}: {
  members: { id: string; name: string }[];
  customers?: { id: string; full_name: string }[];
  fixedCustomerId?: string;
  defaultAssigneeId: string;
}) {
  const [state, action, pending] = useActionState(createTaskAction, initialActionState);
  const e = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error" && !state.fieldErrors) toast.error(state.message);
  }, [state]);

  return (
    <form action={action} key={state.payload?.nonce ?? "form"} className="grid gap-3 sm:grid-cols-6" noValidate>
      {fixedCustomerId ? <input type="hidden" name="customer_id" value={fixedCustomerId} /> : null}
      <FormField id="task_title" label="Tarefa" required error={e.title} className="sm:col-span-6">
        <Input id="task_title" name="title" defaultValue={state.values?.title} placeholder="Ex.: Ligar para confirmar datas" maxLength={160} />
      </FormField>
      <FormField id="task_type" label="Tipo" className="sm:col-span-2">
        <NativeSelect id="task_type" name="task_type" defaultValue={state.values?.task_type ?? "other"}>
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {TASK_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="task_due" label="Prazo" error={e.due_local} className="sm:col-span-2">
        <Input id="task_due" name="due_local" type="datetime-local" defaultValue={state.values?.due_local} />
      </FormField>
      <FormField id="task_priority" label="Prioridade" className="sm:col-span-2">
        <NativeSelect id="task_priority" name="priority" defaultValue={state.values?.priority ?? "normal"}>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_LABELS[p]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="task_assignee" label="Responsável" className={customers ? "sm:col-span-3" : "sm:col-span-4"}>
        <NativeSelect id="task_assignee" name="assigned_member_id" defaultValue={state.values?.assigned_member_id ?? defaultAssigneeId}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {customers ? (
        <FormField id="task_customer" label="Cliente" className="sm:col-span-3">
          <NativeSelect id="task_customer" name="customer_id" defaultValue={state.values?.customer_id ?? ""}>
            <option value="">Nenhum</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      ) : null}
      <div className={cn("flex items-end justify-end", customers ? "sm:col-span-6" : "sm:col-span-2")}>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          Criar tarefa
        </Button>
      </div>
    </form>
  );
}

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: "bg-slate-400",
  normal: "bg-sky-500",
  high: "bg-amber-500",
  urgent: "bg-rose-500",
};

export function TaskList({ tasks, showCustomer = true, emptyText }: { tasks: TaskRow[]; showCustomer?: boolean; emptyText: string }) {
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ status: string; message?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.status === "error") toast.error(result.message);
      else if (result.message) toast.success(result.message);
    });

  if (tasks.length === 0) return <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {tasks.map((t) => {
        const done = t.status === "done";
        return (
          <li key={t.id} className="flex items-start gap-3 p-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setTaskStatusAction(t.id, done ? "open" : "done"))}
              aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                done ? "border-success bg-success text-white" : "hover:border-primary hover:bg-accent",
              )}
            >
              {done ? <Check className="size-3" /> : null}
            </button>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>{t.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", PRIORITY_DOT[t.priority])} />
                  {TASK_TYPE_LABELS[t.type]}
                </span>
                {t.dueLabel ? <span className={cn(t.overdue && !done && "font-medium text-destructive")}>{t.overdue && !done ? "Atrasada · " : ""}{t.dueLabel}</span> : null}
                <span>{t.assigneeName ?? "Sem responsável"}</span>
                {showCustomer && t.customer ? (
                  <Link href={`/customers/${t.customer.id}`} className="text-primary hover:underline">
                    {t.customer.name}
                  </Link>
                ) : null}
              </p>
              {t.description ? <p className="mt-1 text-xs text-muted-foreground">{t.description}</p> : null}
            </div>
            <div className="flex shrink-0 gap-1">
              {done ? (
                <Button variant="ghost" size="icon-sm" aria-label="Reabrir" disabled={pending} onClick={() => run(() => setTaskStatusAction(t.id, "open"))}>
                  <RotateCcw />
                </Button>
              ) : null}
              <Button variant="ghost" size="icon-sm" aria-label="Excluir tarefa" disabled={pending} onClick={() => run(() => deleteTaskAction(t.id))}>
                <Trash2 />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
