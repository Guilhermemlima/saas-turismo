import { ArrowLeft, CalendarClock, Mail, MapPin, Phone, Plane, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { CreatedToast } from "@/components/shared/created-toast";
import { PageContainer } from "@/components/shared/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { updateCustomerAction } from "@/modules/customers/actions";
import { ArchiveCustomerButton } from "@/modules/customers/components/archive-customer-button";
import { CustomerForm } from "@/modules/customers/components/customer-form";
import { getCustomer } from "@/modules/customers/repository";
import { CUSTOMER_SOURCE_LABELS } from "@/modules/customers/schemas";
import { CustomerNotes, CustomerPreferences, CustomerTags } from "@/modules/customer-details/components/customer-details";
import { getCustomerDetails } from "@/modules/customer-details/repository";
import { StartSimulationButton } from "@/modules/inbox/components/start-simulation-button";
import { listActiveMembers } from "@/modules/members/repository";
import { TaskForm, TaskList } from "@/modules/tasks/components/task-components";
import { listTasks } from "@/modules/tasks/repository";
import { toTaskRows } from "@/modules/tasks/view-model";
import { RequestsTable } from "@/modules/travel-requests/components/requests-table";
import { listCustomerTravelRequests } from "@/modules/travel-requests/repository";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Cliente" };

const HISTORY = [
  { title: "Cotações e propostas", phase: 16 },
  { title: "Reservas e viagens", phase: 20 },
];

export default async function CustomerPage(props: PageProps<"/customers/[id]">) {
  const ctx = await requireTenant();
  if (!can(ctx, "customers.read")) redirect("/dashboard");

  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();

  const db = await createSupabaseServerClient();
  const [customer, members, requests, details, tasks, settings] = await Promise.all([
    getCustomer(db, ctx, id),
    listActiveMembers(db, ctx),
    can(ctx, "deals.read") ? listCustomerTravelRequests(db, ctx, id) : Promise.resolve([]),
    getCustomerDetails(db, ctx, id),
    listTasks(db, ctx, { view: "all", customerId: id, limit: 20 }),
    db.from("agency_settings").select("timezone").eq("agency_id", ctx.agencyId).maybeSingle(),
  ]);
  if (!customer) notFound();

  const canWrite = can(ctx, "customers.write");
  const owner = members.find((m) => m.id === customer.owner_member_id);
  const archived = customer.archived_at !== null;
  const timeZone = settings.data?.timezone ?? "America/Sao_Paulo";
  const noteFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone });
  const canEditDetails = canWrite && !archived;

  return (
    <PageContainer>
      <Suspense>
        <CreatedToast message="Cliente cadastrado." />
      </Suspense>
      <Link href="/customers" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft /> Clientes
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="size-14 rounded-xl">
            <AvatarFallback className="rounded-xl bg-accent text-lg font-medium text-accent-foreground">
              {initials(customer.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
              {customer.full_name}
              {archived ? <Badge variant="outline">Arquivado</Badge> : null}
            </h1>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {customer.phone_e164 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" /> {formatPhone(customer.phone_e164)}
                </span>
              ) : null}
              {customer.email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" /> {customer.email}
                </span>
              ) : null}
              {customer.city ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" /> {customer.city}
                  {customer.state ? ` · ${customer.state}` : ""}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(ctx, "conversations.read") && !archived ? <StartSimulationButton customerId={customer.id} /> : null}
          {can(ctx, "customers.archive") ? <ArchiveCustomerButton customerId={customer.id} archived={archived} /> : null}
        </div>
      </div>

      {can(ctx, "deals.read") ? (
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Plane className="size-4 text-muted-foreground" /> Solicitações de viagem
            </h2>
            {can(ctx, "requests.write") && !archived ? (
              <Link href={`/requests/new?customer=${customer.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Plus /> Nova solicitação
              </Link>
            ) : null}
          </div>
          {requests.length > 0 ? (
            <RequestsTable items={requests} showCustomer={false} />
          ) : (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhuma solicitação para este cliente ainda.
            </p>
          )}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Dados do cliente</CardTitle>
            <CardDescription>{canWrite ? "Edite e salve as alterações." : "Somente leitura para o seu perfil."}</CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerForm
              action={updateCustomerAction.bind(null, customer.id)}
              members={members}
              readOnly={!canWrite}
              submitLabel="Salvar alterações"
              defaults={customer}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <Row label="Origem" value={CUSTOMER_SOURCE_LABELS[customer.source]} />
              <Row label="Consultor" value={owner?.name ?? "—"} />
              <Row label="Nascimento" value={formatDate(customer.birth_date)} />
              <Row label="Marketing" value={customer.marketing_opt_in ? "Autorizado" : "Não autorizado"} />
              <Row label="Cadastrado em" value={formatDateTime(customer.created_at)} />
              <Row label="Atualizado em" value={formatDateTime(customer.updated_at)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerTags customerId={customer.id} allTags={details.allTags} appliedIds={details.customerTagIds} canEdit={canEditDetails} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preferências do viajante</CardTitle>
              <CardDescription>Memória que a equipe e, depois, a IA usam para personalizar ofertas.</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerPreferences customerId={customer.id} preferences={details.preferences} canEdit={canEditDetails} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4" /> Histórico do viajante
              </CardTitle>
              <CardDescription>Cada seção é preenchida quando o módulo correspondente entrar no ar.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {HISTORY.map((item) => (
                <div key={item.title} className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{item.title}</span>
                  <Badge variant="outline">Fase {item.phase}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Notas internas</CardTitle>
            <CardDescription>Visíveis apenas para a equipe da agência.</CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerNotes
              customerId={customer.id}
              canEdit={canEditDetails}
              currentUserId={ctx.userId}
              canModerate={ctx.role === "owner" || ctx.role === "manager"}
              notes={details.notes.map((n) => ({ ...n, when: noteFmt.format(new Date(n.createdAt)) }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tarefas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {can(ctx, "tasks.write") && !archived ? (
              <TaskForm members={members} fixedCustomerId={customer.id} defaultAssigneeId={customer.owner_member_id ?? ctx.memberId} />
            ) : null}
            <TaskList tasks={toTaskRows(tasks, timeZone)} showCustomer={false} emptyText="Nenhuma tarefa aberta para este cliente." />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
