import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createCustomerAction } from "@/modules/customers/actions";
import { CustomerForm } from "@/modules/customers/components/customer-form";
import { listActiveMembers } from "@/modules/members/repository";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewCustomerPage() {
  const ctx = await requireTenant();
  if (!can(ctx, "customers.write")) redirect("/customers");

  const members = await listActiveMembers(await createSupabaseServerClient(), ctx);

  return (
    <PageContainer className="max-w-3xl">
      <Link href="/customers" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft /> Clientes
      </Link>
      <PageHeader title="Novo cliente" description="Dados básicos do viajante. Preferências e viagens entram nas próximas fases." />
      <Card>
        <CardContent>
          <CustomerForm
            action={createCustomerAction}
            members={members}
            defaults={{ owner_member_id: ctx.memberId }}
            submitLabel="Cadastrar cliente"
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
