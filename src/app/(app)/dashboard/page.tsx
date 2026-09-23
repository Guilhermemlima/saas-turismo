import { ArrowRight, CircleCheck, CircleDashed, Lock, Plane, UserPlus, Users, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NAV_ITEMS } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { onboardingProgress } from "@/modules/agencies/onboarding";
import { countCustomers } from "@/modules/customers/repository";
import { listActiveMembers } from "@/modules/members/repository";
import { countOpenTravelRequests } from "@/modules/travel-requests/repository";
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

  const canReadDeals = can(ctx, "deals.read");
  const [totalCustomers, newCustomers, members, openRequests, { data: agency }] = await Promise.all([
    canReadCustomers ? countCustomers(db, ctx) : Promise.resolve(null),
    canReadCustomers ? countCustomers(db, ctx, { createdInLastDays: 30 }) : Promise.resolve(null),
    listActiveMembers(db, ctx),
    canReadDeals ? countOpenTravelRequests(db, ctx) : Promise.resolve(null),
    db.from("agencies").select("onboarding_completed_steps").eq("id", ctx.agencyId).maybeSingle(),
  ]);
  const onboarding = onboardingProgress(agency?.onboarding_completed_steps ?? []);
  const showOnboarding = !onboarding.allAvailableDone && can(ctx, "settings.manage");

  const stats = [
    { label: "Clientes ativos", value: totalCustomers, icon: Users, href: "/customers" },
    { label: "Novos clientes (30 dias)", value: newCustomers, icon: UserPlus, href: "/customers" },
    { label: "Solicitações abertas", value: openRequests, icon: Plane, href: "/requests" },
    { label: "Equipe", value: members.length, icon: UsersRound, href: "/settings" },
  ];

  const upcoming = NAV_ITEMS.filter((item) => item.phase).sort((a, b) => (a.phase ?? 0) - (b.phase ?? 0));
  const firstName = ctx.fullName.split(" ")[0];

  return (
    <PageContainer>
      <PageHeader title={`Olá, ${firstName}`} description={`Visão geral da ${ctx.agencyName}.`} />

      {showOnboarding ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              Primeiros passos
              <span className="text-sm font-medium text-muted-foreground tabular-nums">
                {onboarding.completedAvailable}/{onboarding.totalAvailable}
              </span>
            </CardTitle>
            <CardDescription>Complete a configuração da agência. As etapas de IA e WhatsApp liberam nas próximas fases.</CardDescription>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(onboarding.completedAvailable / onboarding.totalAvailable) * 100}%` }}
              />
            </div>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {onboarding.steps.map((step) => {
                const locked = step.phase !== null;
                const content = (
                  <>
                    {step.done ? (
                      <CircleCheck className="size-4 shrink-0 text-success" />
                    ) : locked ? (
                      <Lock className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <CircleDashed className="size-4 shrink-0 text-primary" />
                    )}
                    <span className={cn("flex-1", step.done && "text-muted-foreground line-through")}>{step.title}</span>
                    {locked ? <Badge variant="outline">Fase {step.phase}</Badge> : null}
                  </>
                );
                return (
                  <li key={step.step}>
                    {locked || step.done ? (
                      <div className="flex h-full items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">{content}</div>
                    ) : (
                      <Link href={step.href} className="flex h-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-accent">
                        {content}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
