import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listActiveMembers } from "@/modules/members/repository";
import { TaskForm, TaskList } from "@/modules/tasks/components/task-components";
import { listTasks } from "@/modules/tasks/repository";
import { taskListQuerySchema } from "@/modules/tasks/schemas";
import { toTaskRows } from "@/modules/tasks/view-model";
import { listCustomerOptions } from "@/modules/travel-requests/repository";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Tarefas" };

const VIEWS = [
  { value: "mine", label: "Minhas" },
  { value: "all", label: "Equipe" },
  { value: "overdue", label: "Atrasadas" },
  { value: "done", label: "Concluídas" },
] as const;

const EMPTY: Record<(typeof VIEWS)[number]["value"], string> = {
  mine: "Nenhuma tarefa aberta para você. 🎉",
  all: "Nenhuma tarefa aberta na equipe.",
  overdue: "Nenhuma tarefa atrasada.",
  done: "Nenhuma tarefa concluída ainda.",
};

export default async function TasksPage(props: PageProps<"/tasks">) {
  const ctx = await requireTenant();
  const { view } = taskListQuerySchema.parse(await props.searchParams);
  const db = await createSupabaseServerClient();

  const [tasks, members, customers, settings] = await Promise.all([
    listTasks(db, ctx, { view }),
    listActiveMembers(db, ctx),
    can(ctx, "customers.read") ? listCustomerOptions(db, ctx) : Promise.resolve([]),
    db.from("agency_settings").select("timezone").eq("agency_id", ctx.agencyId).maybeSingle(),
  ]);
  const rows = toTaskRows(tasks, settings.data?.timezone ?? "America/Sao_Paulo");

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Tarefas" description="O que precisa ser feito por quem, e até quando." />

      {can(ctx, "tasks.write") ? (
        <Card>
          <CardHeader>
            <CardTitle>Nova tarefa</CardTitle>
          </CardHeader>
          <CardContent>
            <TaskForm members={members} customers={customers} defaultAssigneeId={ctx.memberId} />
          </CardContent>
        </Card>
      ) : null}

      <nav className="inline-flex w-fit rounded-lg bg-muted p-0.5 text-sm" aria-label="Filtrar tarefas">
        {VIEWS.map((v) => (
          <Link
            key={v.value}
            href={v.value === "mine" ? "/tasks" : `/tasks?view=${v.value}`}
            aria-current={view === v.value ? "page" : undefined}
            className={cn("rounded-md px-3 py-1 text-muted-foreground transition-colors", view === v.value && "bg-background text-foreground shadow-sm")}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      <TaskList tasks={rows} emptyText={EMPTY[view]} />
    </PageContainer>
  );
}
