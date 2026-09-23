import { ArrowRight, UserPlus, Users, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NAV_ITEMS } from "@/config/navigation";
import { countCustomers } from "@/modules/customers/repository";
import { listActiveMembers } from "@/modules/members/repository";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Dashboard" };

const UPCOMING_KPIS = [
  "Novos leads e leads qualificados",
  "Cotações pendentes e em andamento",
  "Propostas enviadas e negociações",
  "Reservas, vendas e faturamento",
  "Ticket médio e conversão",
  "Tempo médio de resposta",
  "Atendimentos IA × humanos",
  "Follow-ups pendentes e próximas viagens",
];

export default async function DashboardPage() {
  const ctx = await requireTenant();
  const db = await createSupabaseServerClient();
  const canReadCustomers = can(ctx, "customers.read");

  const [totalCustomers, newCustomers, members] = await Promise.all([
    canReadCustomers ? countCustomers(db, ctx) : Promise.resolve(null),
    canReadCustomers ? countCustomers(db, ctx, { createdInLastDays: 30 }) : Promise.resolve(null),
    listActiveMembers(db, ctx),
  ]);

  const stats = [
    { label: "Clientes ativos", value: totalCustomers, icon: Users, href: "/customers" },
    { label: "Novos clientes (30 dias)", value: newCustomers, icon: UserPlus, href: "/customers" },
    { label: "Equipe", value: members.length, icon: UsersRound, href: "/settings" },
  ];

  const upcoming = NAV_ITEMS.filter((item) => item.phase).sort((a, b) => (a.phase ?? 0) - (b.phase ?? 0));
  const firstName = ctx.fullName.split(" ")[0];

  return (
    <PageContainer>
      <PageHeader title={`Olá, ${firstName}`} description={`Visão geral da ${ctx.agencyName}.`} />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Card className="transition-colors group-hover:border-primary/30">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardDescription>{stat.label}</CardDescription>
                <stat.icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">{stat.value ?? "—"}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Indicadores comerciais</CardTitle>
            <CardDescription>
              Estes números aparecem conforme cada módulo é ativado. Nada é exibido antes de existirem dados reais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {UPCOMING_KPIS.map((kpi) => (
                <li key={kpi} className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                  {kpi}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Próximos módulos</CardTitle>
            <CardDescription>Roadmap da plataforma.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {upcoming.slice(0, 6).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted"
              >
                <item.icon className="size-4 text-muted-foreground" />
                <span className="flex-1">{item.title}</span>
                <Badge variant="outline">Fase {item.phase}</Badge>
              </Link>
            ))}
            {canReadCustomers ? (
              <Link href="/customers/new" className={buttonVariants({ variant: "outline", className: "mt-3 w-full" })}>
                Cadastrar primeiro cliente <ArrowRight />
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
