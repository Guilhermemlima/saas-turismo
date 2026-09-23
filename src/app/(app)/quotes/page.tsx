import { Plus, Receipt, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { ListFilters } from "@/components/shared/list-filters";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { buttonVariants } from "@/components/ui/button";
import { QuotesTable } from "@/modules/quotes/components/quotes-table";
import { listQuotes } from "@/modules/quotes/repository";
import { QUOTES_PAGE_SIZE, quoteListQuerySchema } from "@/modules/quotes/schemas";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Cotações" };

const TABS = [
  { value: "draft" as const, label: "Em montagem" },
  { value: "ready" as const, label: "Prontas" },
  { value: "archived" as const, label: "Arquivadas" },
  { value: "all" as const, label: "Todas" },
];

export default async function QuotesPage(props: PageProps<"/quotes">) {
  const ctx = await requireTenant();
  if (!can(ctx, "quotes.read")) redirect("/dashboard");

  const query = quoteListQuerySchema.parse(await props.searchParams);
  const db = await createSupabaseServerClient();
  const { items, total } = await listQuotes(db, ctx, query);
  const canWrite = can(ctx, "quotes.write");

  const hrefForPage = (page: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status !== "draft") params.set("status", query.status);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/quotes?${qs}` : "/quotes";
  };

  return (
    <PageContainer>
      <PageHeader
        title="Cotações"
        description="Monte opções com voos, hospedagem e serviços; totais e margem são calculados automaticamente."
        actions={
          canWrite ? (
            <Link href="/quotes/new" className={buttonVariants()}>
              <Plus /> Nova cotação
            </Link>
          ) : null
        }
      />

      <Suspense>
        <ListFilters q={query.q} status={query.status} defaultStatus="draft" placeholder="Título da cotação" tabs={TABS} />
      </Suspense>

      {items.length > 0 ? (
        <>
          <QuotesTable items={items} />
          <Pagination page={query.page} pageSize={QUOTES_PAGE_SIZE} total={total} hrefForPage={hrefForPage} />
        </>
      ) : query.q ? (
        <EmptyState icon={SearchX} title="Nenhuma cotação encontrada" description={`Nada corresponde a “${query.q}”.`} />
      ) : (
        <EmptyState
          icon={Receipt}
          title="Nenhuma cotação por aqui"
          description="Crie uma cotação a partir de um negócio do CRM ou de uma solicitação de viagem. Cada cotação pode ter várias opções para o cliente comparar."
          action={
            canWrite ? (
              <Link href="/quotes/new" className={buttonVariants({ variant: "outline" })}>
                <Plus /> Nova cotação
              </Link>
            ) : null
          }
        />
      )}
    </PageContainer>
  );
}
