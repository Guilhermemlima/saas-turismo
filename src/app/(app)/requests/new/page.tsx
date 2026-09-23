import { ArrowLeft, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listActiveMembers } from "@/modules/members/repository";
import { createTravelRequestAction } from "@/modules/travel-requests/actions";
import { TravelRequestForm } from "@/modules/travel-requests/components/travel-request-form";
import { listCustomerOptions } from "@/modules/travel-requests/repository";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Nova solicitação" };

export default async function NewRequestPage(props: PageProps<"/requests/new">) {
  const ctx = await requireTenant();
  if (!can(ctx, "requests.write")) redirect("/requests");

  const { customer } = await props.searchParams;
  const db = await createSupabaseServerClient();
  const [customers, members] = await Promise.all([listCustomerOptions(db, ctx), listActiveMembers(db, ctx)]);
  const preselected = typeof customer === "string" && customers.some((c) => c.id === customer) ? customer : undefined;
  const backHref = preselected ? `/customers/${preselected}` : "/requests";

  return (
    <PageContainer className="max-w-4xl">
      <Link href={backHref} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft /> Voltar
      </Link>
      <PageHeader
        title="Nova solicitação de viagem"
        description="Preencha o que o cliente já contou; o checklist mostra o que falta. Cada solicitação vira um negócio no CRM."
      />
      {customers.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Cadastre um cliente primeiro"
          description="Toda solicitação pertence a um viajante."
          action={
            <Link href="/customers/new" className={buttonVariants({ variant: "outline" })}>
              Novo cliente
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent>
            <TravelRequestForm
              action={createTravelRequestAction}
              customers={customers}
              members={members}
              defaults={{ customer_id: preselected, assigned_member_id: ctx.memberId }}
              submitLabel="Criar solicitação"
            />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
