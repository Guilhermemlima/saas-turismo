import { ArrowRight, Building2, Clock, KanbanSquare, Plug, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { publicStorageUrl } from "@/lib/storage";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { getIntegrationStatuses } from "@/server/integrations/registry";

export const metadata: Metadata = { title: "Configurações" };

const STATUS_LABELS = { trial: "Período de teste", active: "Ativa", suspended: "Suspensa", cancelled: "Cancelada" } as const;

export default async function SettingsPage() {
  const ctx = await requireTenant();
  const db = await createSupabaseServerClient();
  const { data: agency } = await db.from("agencies").select("name, status, logo_path, city, state").eq("id", ctx.agencyId).single();
  const logoUrl = publicStorageUrl("agency-logos", agency?.logo_path);

  const sections = [
    { href: "/settings/agency", icon: Building2, title: "Dados da agência", description: "Nome, CNPJ, contatos, logo e especialidades.", show: true },
    { href: "/settings/team", icon: UsersRound, title: "Equipe", description: "Convites, perfis de acesso e desativação de membros.", show: can(ctx, "members.manage") },
    { href: "/settings/hours", icon: Clock, title: "Horários de atendimento", description: "Dias, horários e fuso da agência.", show: true },
    { href: "/settings/pipeline", icon: KanbanSquare, title: "Etapas do pipeline", description: "Renomeie, reordene e crie etapas do CRM.", show: can(ctx, "settings.manage") },
  ].filter((s) => s.show);

  return (
    <PageContainer>
      <PageHeader title="Configurações" description="Como a sua agência funciona na plataforma." />

      <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- small public logo
            <img src={logoUrl} alt="" className="size-full object-contain p-1.5" />
          ) : (
            <Building2 className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{agency?.name}</p>
          <p className="text-sm text-muted-foreground">{agency?.city ? `${agency.city}${agency.state ? ` · ${agency.state}` : ""}` : "Cidade não informada"}</p>
        </div>
        {agency ? <Badge variant="secondary">{STATUS_LABELS[agency.status]}</Badge> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/30"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <section.icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{section.title}</p>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-4" /> Integrações
          </CardTitle>
          <CardDescription>Status real: uma integração só aparece como conectada quando estiver implementada e com credenciais válidas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {getIntegrationStatuses().map((integration) => (
            <div key={integration.key} className="flex flex-col gap-2 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{integration.label}</span>
                <Badge variant={integration.configured ? "default" : "outline"}>{integration.configured ? "Conectado" : "Não configurado"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{integration.description}</p>
              <p className="text-xs text-muted-foreground">{integration.phase ? `Previsto para a fase ${integration.phase}` : "Integração futura"}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
