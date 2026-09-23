import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { QuoteStatusBadge } from "@/modules/quotes/components/quote-status-badge";
import { listQuotes } from "@/modules/quotes/repository";
import { quoteListQuerySchema } from "@/modules/quotes/schemas";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Cotações" };

const TABS = [
  { value: "open", label: "Abertas" },
  { value: "draft", label: "Em montagem" },
  { value: "ready", label: "Prontas" },
  { value: "archived", label: "Arquivadas" },
] as const;

export default async function QuotesPage(props: PageProps<"/quotes">) {
  const ctx = await requireTenant();
  if (!can(ctx, "quotes.write") && !can(ctx, "quotes.view_margin")) redirect("/dashboard");

  const { status } = quoteListQuerySchema.parse(await props.searchParams);
  const quotes = await listQuotes(await createSupabaseServerClient(), ctx, { status });
  const showMargin = can(ctx, "quotes.view_margin");

  return (
    <PageContainer>
      <PageHeader title="Cotações" description="Opções de voo, hotel e serviços montadas para cada solicitação." />

      <nav className="inline-flex w-fit flex-wrap rounded-lg bg-muted p-0.5 text-sm" aria-label="Filtrar cotações">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "open" ? "/quotes" : `/quotes?status=${t.value}`}
            aria-current={status === t.value ? "page" : undefined}
            className={cn("rounded-md px-3 py-1 text-muted-foreground transition-colors", status === t.value && "bg-background text-foreground shadow-sm")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {quotes.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhuma cotação aqui"
          description="Abra uma solicitação de viagem e clique em “Criar cotação” para montar as opções do cliente."
          action={
            <Link href="/requests" className={buttonVariants({ variant: "outline" })}>
              Ver solicitações
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Cotação</TableHead>
                <TableHead className="hidden md:table-cell">Cliente</TableHead>
                <TableHead className="hidden sm:table-cell">Opções</TableHead>
                <TableHead>A partir de</TableHead>
                {showMargin ? <TableHead className="hidden lg:table-cell">Melhor margem</TableHead> : null}
                <TableHead className="pr-4 text-right">Atualizada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q) => {
                const totals = q.options.map((o) => o.total_cents).filter((t) => t > 0);
                const best = q.options.length ? Math.max(...q.options.map((o) => o.margin_cents)) : null;
                return (
                  <TableRow key={q.id} className="relative">
                    <TableCell className="pl-4">
                      <Link href={`/quotes/${q.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
                        {q.title}
                      </Link>
                      <div className="mt-1">
                        <QuoteStatusBadge status={q.status} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{q.customer?.full_name ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{q.options.length}</TableCell>
                    <TableCell className="tabular-nums">{totals.length ? formatMoney(Math.min(...totals), q.currency) : "—"}</TableCell>
                    {showMargin ? <TableCell className="hidden tabular-nums lg:table-cell">{best !== null ? formatMoney(best, q.currency) : "—"}</TableCell> : null}
                    <TableCell className="pr-4 text-right text-muted-foreground">{formatRelative(q.updated_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  );
}
