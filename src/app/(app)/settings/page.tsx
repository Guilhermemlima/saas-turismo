import { ArrowRight, KanbanSquare, Plug } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatPhone } from "@/lib/phone";
import { listActiveMembers } from "@/modules/members/repository";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { getIntegrationStatuses } from "@/server/integrations/registry";

export const metadata: Metadata = { title: "Configurações" };

const STATUS_LABELS = { trial: "Período de teste", active: "Ativa", suspended: "Suspensa", cancelled: "Cancelada" } as const;

export default async function SettingsPage() {
  const ctx = await requireTenant();
  const db = await createSupabaseServerClient();
  const [{ data: agency }, members] = await Promise.all([
    db
      .from("agencies")
      .select("name, email, phone_e164, city, state, status, created_at")
      .eq("id", ctx.agencyId)
      .single(),
    listActiveMembers(db, ctx),
  ]);

  const details = [
    { label: "Nome", value: agency?.name },
    { label: "E-mail", value: agency?.email },
    { label: "Telefone", value: formatPhone(agency?.phone_e164) },
    { label: "Cidade", value: agency?.city ? `${agency.city}${agency.state ? ` · ${agency.state}` : ""}` : null },
  ];

  return (
    <PageContainer>
      <PageHeader title="Configurações" description="Dados da agência, equipe e integrações." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Agência
              {agency ? <Badge variant="secondary">{STATUS_LABELS[agency.status]}</Badge> : null}
            </CardTitle>
            <CardDescription>A edição completa (logo, CNPJ, horários, especialidades) chega com o onboarding completo (fase 4).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {details.map((row) => (
              <div key={row.label} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium">{row.value || "—"}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Equipe</CardTitle>
            <CardDescription>Convites de novos membros chegam na fase 4.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Nome</TableHead>
                  <TableHead className="pr-6 text-right">Perfil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="pl-6 font-medium">
                      {member.name}
                      {member.id === ctx.memberId ? <span className="ml-2 text-xs text-muted-foreground">(você)</span> : null}
                    </TableCell>
                    <TableCell className="pr-6 text-right text-muted-foreground">{ROLE_LABELS[member.role]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {can(ctx, "settings.manage") ? (
        <Link
          href="/settings/pipeline"
          className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/30"
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <KanbanSquare className="size-5" />
          </div>
          <div className="flex-1">
            <p className="font-medium">Etapas do pipeline</p>
            <p className="text-sm text-muted-foreground">Renomeie, reordene, mude cores ou crie etapas próprias do CRM.</p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}

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
                <Badge variant={integration.configured ? "default" : "outline"}>
                  {integration.configured ? "Conectado" : "Não configurado"}
                </Badge>
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
