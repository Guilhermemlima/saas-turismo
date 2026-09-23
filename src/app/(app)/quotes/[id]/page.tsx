import { ArrowLeft, CalendarRange, Lock, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { PageContainer } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTripDates } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { QuoteHeaderForm, QuoteOptions, QuoteStatusActions } from "@/modules/quotes/components/quote-builder";
import { QuoteStatusBadge } from "@/modules/quotes/components/quote-status-badge";
import { getQuote } from "@/modules/quotes/repository";
import { toBuilderOptions } from "@/modules/quotes/view-model";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Cotação" };

export default async function QuotePage(props: PageProps<"/quotes/[id]">) {
  const ctx = await requireTenant();
  if (!can(ctx, "quotes.write") && !can(ctx, "quotes.view_margin")) redirect("/dashboard");

  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const quote = await getQuote(await createSupabaseServerClient(), ctx, id);
  if (!quote) notFound();

  const canWrite = can(ctx, "quotes.write");
  const editable = canWrite && quote.status === "draft";
  const r = quote.request;
  const passengers = r ? (r.adults ?? 0) + r.children + r.infants : 0;
  const facts = [
    { icon: CalendarRange, label: "Datas", value: r ? formatTripDates(r.departure_date, r.return_date, r.travel_month) : null },
    { icon: Users, label: "Passageiros", value: passengers ? `${passengers}` : null },
    { icon: Wallet, label: "Orçamento do cliente", value: r?.budget_cents != null ? formatMoney(r.budget_cents, r.budget_currency) : null },
  ];

  return (
    <PageContainer>
      <Link href="/quotes" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft /> Cotações
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <QuoteStatusBadge status={quote.status} />
          <h1 className="text-2xl font-semibold">{quote.title}</h1>
          <p className="text-sm text-muted-foreground">
            {quote.customer ? (
              <Link href={`/customers/${quote.customer.id}`} className="font-medium text-foreground hover:underline">
                {quote.customer.full_name}
              </Link>
            ) : null}
            {r ? (
              <>
                {" · "}
                <Link href={`/requests/${r.id}`} className="hover:underline">
                  ver solicitação
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {canWrite ? <QuoteStatusActions quoteId={quote.id} status={quote.status} /> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="flex items-start gap-3 rounded-xl border bg-card p-4">
            <fact.icon className="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{fact.label}</p>
              <p className="text-sm font-medium">{fact.value ?? "A definir"}</p>
            </div>
          </div>
        ))}
      </div>

      {quote.status !== "draft" ? (
        <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Lock className="size-4" />
          {quote.status === "ready"
            ? "Cotação pronta e travada — é ela que vira proposta. Reabra para editar."
            : "Cotação arquivada."}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dados da cotação</CardTitle>
        </CardHeader>
        <CardContent>
          <QuoteHeaderForm quoteId={quote.id} title={quote.title} currency={quote.currency} notes={quote.internal_notes} editable={editable} />
        </CardContent>
      </Card>

      <QuoteOptions quoteId={quote.id} options={toBuilderOptions(quote.options)} currency={quote.currency} editable={editable} showMargin={can(ctx, "quotes.view_margin")} />
    </PageContainer>
  );
}
