import { Plane, Plus, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { ListFilters } from "@/components/shared/list-filters";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { buttonVariants } from "@/components/ui/button";
import { RequestsTable } from "@/modules/travel-requests/components/requests-table";
import { listTravelRequests } from "@/modules/travel-requests/repository";
import { REQUESTS_PAGE_SIZE, requestListQuerySchema } from "@/modules/travel-requests/schemas";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Solicitações" };

const TABS = [
  { value: "open" as const, label: "Abertas" },
  { value: "collecting" as const, label: "Em qualificação" },
  { value: "complete" as const, label: "Completas" },
  { value: "all" as const, label: "Todas" },
];

export default async function RequestsPage(props: PageProps<"/requests">) {
  const ctx = await requireTenant();
  if (!can(ctx, "deals.read")) redirect("/dashboard");

  const query = requestListQuerySchema.parse(await props.searchParams);
  const db = await createSupabaseServerClient();
  const { items, total } = await listTravelRequests(db, ctx, query);
  const canWrite = can(ctx, "requests.write");

  const hrefForPage = (page: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status !== "open") params.set("status", query.status);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/requests?${qs}` : "/requests";
  };

  return (
    <PageContainer>
      <PageHeader
        title="Solicitações de viagem"
        description="O que cada viajante quer: destino, datas, passageiros, serviços e orçamento."
        actions={
          canWrite ? (
            <Link href="/requests/new" className={buttonVariants()}>
              <Plus /> Nova solicitação
            </Link>
          ) : null
        }
      />

      <Suspense>
        <ListFilters q={query.q} status={query.status} defaultStatus="open" placeholder="Destino ou origem" tabs={TABS} />
      </Suspense>

      {items.length > 0 ? (
        <>
          <RequestsTable items={items} />
          <Pagination page={query.page} pageSize={REQUESTS_PAGE_SIZE} total={total} hrefForPage={hrefForPage} />
        </>
      ) : query.q ? (
        <EmptyState icon={SearchX} title="Nenhuma solicitação encontrada" description={`Nada corresponde a “${query.q}”.`} />
      ) : (
        <EmptyState
          icon={Plane}
          title="Nenhuma solicitação por aqui"
          description="Registre o pedido de um cliente para acompanhar a qualificação até a cotação. Com o WhatsApp conectado, a IA vai preenchê-las automaticamente."
          action={
            canWrite ? (
              <Link href="/requests/new" className={buttonVariants({ variant: "outline" })}>
                <Plus /> Nova solicitação
              </Link>
            ) : null
          }
        />
      )}
    </PageContainer>
  );
}
