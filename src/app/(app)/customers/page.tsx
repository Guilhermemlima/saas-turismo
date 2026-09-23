import { Plus, SearchX, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { buttonVariants } from "@/components/ui/button";
import { CustomerFilters } from "@/modules/customers/components/customer-filters";
import { CustomersTable } from "@/modules/customers/components/customers-table";
import { listCustomers } from "@/modules/customers/repository";
import { CUSTOMERS_PAGE_SIZE, customerListQuerySchema } from "@/modules/customers/schemas";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage(props: PageProps<"/customers">) {
  const ctx = await requireTenant();
  if (!can(ctx, "customers.read")) redirect("/dashboard");

  const query = customerListQuerySchema.parse(await props.searchParams);
  const db = await createSupabaseServerClient();
  const { items, total } = await listCustomers(db, ctx, query);
  const canWrite = can(ctx, "customers.write");

  const hrefForPage = (page: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status === "archived") params.set("status", "archived");
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/customers?${qs}` : "/customers";
  };

  return (
    <PageContainer>
      <PageHeader
        title="Clientes"
        description="Viajantes da agência, com contato, consultor responsável e histórico."
        actions={
          canWrite ? (
            <Link href="/customers/new" className={buttonVariants()}>
              <Plus /> Novo cliente
            </Link>
          ) : null
        }
      />

      <Suspense>
        <CustomerFilters q={query.q} status={query.status} />
      </Suspense>

      {items.length > 0 ? (
        <>
          <CustomersTable items={items} />
          <Pagination page={query.page} pageSize={CUSTOMERS_PAGE_SIZE} total={total} hrefForPage={hrefForPage} />
        </>
      ) : query.q ? (
        <EmptyState icon={SearchX} title="Nenhum cliente encontrado" description={`Nada corresponde a “${query.q}”. Tente outro nome, e-mail ou telefone.`} />
      ) : query.status === "archived" ? (
        <EmptyState icon={Users} title="Nenhum cliente arquivado" description="Clientes arquivados aparecem aqui e podem ser restaurados." />
      ) : (
        <EmptyState
          icon={Users}
          title="Sua carteira de clientes começa aqui"
          description="Cadastre viajantes manualmente agora. Quando o WhatsApp for conectado, novos contatos entram automaticamente."
          action={
            canWrite ? (
              <Link href="/customers/new" className={buttonVariants({ variant: "outline" })}>
                <Plus /> Cadastrar cliente
              </Link>
            ) : null
          }
        />
      )}
    </PageContainer>
  );
}
