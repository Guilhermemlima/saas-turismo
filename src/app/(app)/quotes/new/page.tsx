import { ArrowLeft, KanbanSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreateQuoteForm } from "@/modules/quotes/components/create-quote-form";
import { listQuotableDeals } from "@/modules/quotes/repository";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Nova cotação" };

export default async function NewQuotePage(props: PageProps<"/quotes/new">) {
  const ctx = await requireTenant();
  if (!can(ctx, "quotes.write")) redirect("/quotes");

  const { deal, from } = await props.searchParams;
  const db = await createSupabaseServerClient();
  const deals = (await listQuotableDeals(db, ctx)).map((d) => ({ id: d.id, title: d.title, customerName: d.customer?.full_name ?? "" }));
  const preselected = typeof deal === "string" && deals.some((d) => d.id === deal) ? deal : undefined;
  // Only same-site relative paths are accepted as the back link.
  const backHref = typeof from === "string" && /^\/[a-z]/.test(from) ? from : "/quotes";

  return (
    <PageContainer className="max-w-3xl">
      <Link href={backHref} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft /> Voltar
      </Link>
      <PageHeader
        title="Nova cotação"
        description="A cotação fica ligada ao negócio: o card avança para “Em cotação” no CRM. Depois, adicione opções e itens."
      />
      {deals.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="Nenhum negócio em aberto"
          description="Crie uma solicitação de viagem: ela gera o negócio que receberá a cotação."
          action={
            <Link href="/requests/new" className={buttonVariants({ variant: "outline" })}>
              Nova solicitação
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent>
            <CreateQuoteForm deals={deals} preselectedDealId={preselected} />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
