import { ArrowLeft, CalendarRange, Receipt, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { CreatedToast } from "@/components/shared/created-toast";
import { PageContainer } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTripDates } from "@/lib/dates";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { listActiveMembers } from "@/modules/members/repository";
import { CreateQuoteButton } from "@/modules/quotes/components/create-quote-button";
import { QuoteStatusBadge } from "@/modules/quotes/components/quote-status-badge";
import { listQuotes } from "@/modules/quotes/repository";
import { updateTravelRequestAction } from "@/modules/travel-requests/actions";
import { ArchiveRequestButton } from "@/modules/travel-requests/components/archive-request-button";
import { RequestStatusBadge, StageBadge } from "@/modules/travel-requests/components/badges";
import { CompletenessCard } from "@/modules/travel-requests/components/completeness-card";
import { passengersLabel } from "@/modules/travel-requests/components/requests-table";
import { TravelRequestForm } from "@/modules/travel-requests/components/travel-request-form";
import { BUDGET_SCOPE_LABELS } from "@/modules/travel-requests/labels";
import { getTravelRequest } from "@/modules/travel-requests/repository";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Solicitação" };

export default async function RequestPage(props: PageProps<"/requests/[id]">) {
  const ctx = await requireTenant();
  if (!can(ctx, "deals.read")) redirect("/dashboard");

  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();

  const db = await createSupabaseServerClient();
  const [request, members] = await Promise.all([getTravelRequest(db, ctx, id), listActiveMembers(db, ctx)]);
  if (!request) notFound();
  const canQuote = can(ctx, "quotes.write");
  const quotes = canQuote || can(ctx, "quotes.view_margin") ? await listQuotes(db, ctx, { status: "open", dealId: request.deal_id }) : [];

  const canWrite = can(ctx, "requests.write");
  const closed = request.status === "archived" || request.status === "cancelled";
  const dates = formatTripDates(request.departure_date, request.return_date, request.travel_month);
  const passengers = passengersLabel(request);

  const facts = [
    { icon: CalendarRange, label: "Datas", value: dates ? `${dates}${request.nights ? ` · ${request.nights} noites` : ""}` : null },
    {
      icon: Users,
      label: "Passageiros",
      value: passengers
        ? `${passengers}${request.children_ages.length ? ` (crianças: ${request.children_ages.join(", ")} anos)` : ""}`
        : null,
    },
    {
      icon: Wallet,
      label: "Orçamento",
      value:
        request.budget_cents !== null
          ? `${formatMoney(request.budget_cents, request.budget_currency)}${request.budget_scope ? ` ${BUDGET_SCOPE_LABELS[request.budget_scope]}` : ""}`
          : null,
    },
  ];

  return (
    <PageContainer>
      <Suspense>
        <CreatedToast message="Solicitação criada. Ela já aparece no CRM." />
      </Suspense>
      <Link href="/requests" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft /> Solicitações
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <RequestStatusBadge status={request.status} />
            <StageBadge stage={request.deal?.stage} />
          </div>
          <h1 className="text-2xl font-semibold">{request.destination || "Destino a definir"}</h1>
          {request.customer ? (
            <p className="text-sm text-muted-foreground">
              <Link href={`/customers/${request.customer.id}`} className="font-medium text-foreground hover:underline">
                {request.customer.full_name}
              </Link>
              {request.customer.phone_e164 ? ` · ${formatPhone(request.customer.phone_e164)}` : ""}
            </p>
          ) : null}
        </div>
        {canWrite ? <ArchiveRequestButton requestId={request.id} archived={closed} /> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="flex items-start gap-3 rounded-xl border bg-card p-4">
            <fact.icon className="mt-0.5 size-4 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{fact.label}</p>
              <p className="truncate text-sm font-medium">{fact.value ?? "A definir"}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Detalhes da viagem</CardTitle>
            <CardDescription>
              {closed
                ? "Solicitação arquivada. Reabra para editar."
                : canWrite
                  ? "Ao completar os itens essenciais, o negócio avança sozinho para “Solicitação completa”."
                  : "Somente leitura para o seu perfil."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TravelRequestForm
              action={updateTravelRequestAction.bind(null, request.id)}
              members={members}
              readOnly={!canWrite || closed}
              submitLabel="Salvar alterações"
              defaults={{ ...request, assigned_member_id: request.deal?.assigned_member_id ?? null }}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          {canQuote || quotes.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="size-4" /> Cotações
                </CardTitle>
                <CardDescription>
                  {request.status === "complete" ? "Monte as opções para o cliente." : "Você pode começar mesmo com dados incompletos."}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {quotes.map((q) => {
                  const totals = q.options.map((o) => o.total_cents).filter((t) => t > 0);
                  return (
                    <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{q.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {q.options.length} opç{q.options.length === 1 ? "ão" : "ões"}
                          {totals.length ? ` · a partir de ${formatMoney(Math.min(...totals), q.currency)}` : ""}
                        </span>
                      </span>
                      <QuoteStatusBadge status={q.status} />
                    </Link>
                  );
                })}
                {canQuote && !closed ? <CreateQuoteButton requestId={request.id} variant={quotes.length ? "outline" : "default"} /> : null}
              </CardContent>
            </Card>
          ) : null}
          <CompletenessCard request={request} />
          <Card>
            <CardHeader>
              <CardTitle>Registro</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Criada em</span>
                <span className="font-medium">{formatDateTime(request.created_at)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Completa em</span>
                <span className="font-medium">{formatDateTime(request.completed_at)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Atualizada em</span>
                <span className="font-medium">{formatDateTime(request.updated_at)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
