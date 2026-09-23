import { ArrowLeft, CalendarRange, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { CreatedToast } from "@/components/shared/created-toast";
import { PageContainer } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatTripDates } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { listActiveMembers } from "@/modules/members/repository";
import { QuoteBuilder } from "@/modules/quotes/components/quote-builder";
import { QuoteStatusBadge } from "@/modules/quotes/components/quotes-table";
import { getQuote } from "@/modules/quotes/repository";
import { StageBadge } from "@/modules/travel-requests/components/badges";
import { passengersLabel } from "@/modules/travel-requests/components/requests-table";
import { BUDGET_SCOPE_LABELS } from "@/modules/travel-requests/labels";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Cotação" };

export default async function QuotePage(props: PageProps<"/quotes/[id]">) {
  const ctx = await requireTenant();
  if (!can(ctx, "quotes.read")) redirect("/dashboard");

  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();

  const db = await createSupabaseServerClient();
  const [quote, members] = await Promise.all([getQuote(db, ctx, id), listActiveMembers(db, ctx)]);
  if (!quote) notFound();

  const request = quote.request;
  const dates = request ? formatTripDates(request.departure_date, request.return_date, request.travel_month) : null;
  const passengers = request ? passengersLabel(request) : null;
  const facts = [
    { icon: CalendarRange, label: "Datas", value: dates },
    { icon: Users, label: "Passageiros", value: passengers },
    {
      icon: Wallet,
      label: "Orçamento do cliente",
      value:
        request?.budget_cents != null
          ? `${formatMoney(request.budget_cents, request.budget_currency)}${request.budget_scope ? ` ${BUDGET_SCOPE_LABELS[request.budget_scope]}` : ""}`
          : null,
    },
  ];

  // Cost, markup and commission never reach the browser of someone who cannot see margins.
  const showMargin = can(ctx, "quotes.view_margin");
  const internal = (cents: number) => (showMargin ? cents : 0);

  return (
    <PageContainer>
      <Suspense>
        <CreatedToast message="Cotação criada. Adicione os itens da primeira opção." />
      </Suspense>
      <Link href="/quotes" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft /> Cotações
      </Link>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <QuoteStatusBadge status={quote.status} />
          <StageBadge stage={quote.deal?.stage} />
        </div>
        <h1 className="text-2xl font-semibold">{quote.title}</h1>
        <p className="text-sm text-muted-foreground">
          {quote.customer ? (
            <Link href={`/customers/${quote.customer.id}`} className="font-medium text-foreground hover:underline">
              {quote.customer.full_name}
            </Link>
          ) : null}
          {request ? (
            <>
              {" · "}
              <Link href={`/requests/${request.id}`} className="hover:underline">
                {request.destination || "Solicitação de viagem"}
              </Link>
            </>
          ) : null}
        </p>
      </div>

      {request ? (
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
      ) : null}

      <QuoteBuilder
        quote={{
          id: quote.id,
          title: quote.title,
          status: quote.status,
          currency: quote.currency,
          assigned_member_id: quote.assigned_member_id,
          internal_notes: quote.internal_notes,
          options: quote.options.map((o) => ({
            id: o.id,
            title: o.title,
            description: o.description,
            service_fee_cents: o.service_fee_cents,
            discount_cents: o.discount_cents,
            totals: {
              subtotal_cents: o.subtotal_cents,
              service_fee_cents: o.service_fee_cents,
              discount_cents: o.discount_cents,
              total_cents: o.total_cents,
              cost_total_cents: internal(o.cost_total_cents),
              margin_cents: internal(o.margin_cents),
              commission_total_cents: internal(o.commission_total_cents),
              gross_profit_cents: internal(o.margin_cents + o.commission_total_cents),
            },
            items: o.items.map((i) => ({
              id: i.id,
              item_type: i.item_type,
              title: i.title,
              description: i.description,
              supplier_name: i.supplier_name,
              start_date: i.start_date,
              end_date: i.end_date,
              quantity: i.quantity,
              cost_cents: internal(i.cost_cents),
              markup_cents: internal(i.markup_cents),
              pass_through_fees_cents: i.pass_through_fees_cents,
              commission_cents: internal(i.commission_cents),
              price_cents: i.price_cents,
              total_cents: i.total_cents,
              show_price_to_customer: i.show_price_to_customer,
              details: i.details,
            })),
          })),
        }}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        canWrite={can(ctx, "quotes.write")}
        showMargin={showMargin}
      />
    </PageContainer>
  );
}
