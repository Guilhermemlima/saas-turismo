import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SettingsBack } from "@/components/shared/settings-back";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";
import { InviteForm, MembersList, PendingInvites } from "@/modules/members/components/team-manager";
import { listPendingInvitations, listTeam } from "@/modules/members/repository";
import { can, requireTenant } from "@/server/auth/tenant";
import type { AgencyRole } from "@/server/db/database.types";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const ctx = await requireTenant();
  if (!can(ctx, "members.manage")) redirect("/settings");

  const db = await createSupabaseServerClient();
  const [team, invites] = await Promise.all([listTeam(db, ctx), listPendingInvitations(db, ctx)]);

  return (
    <PageContainer className="max-w-4xl">
      <SettingsBack />
      <PageHeader title="Equipe" description="Convide consultores, atendentes e o financeiro, e defina o que cada um pode fazer." />

      <Card>
        <CardHeader>
          <CardTitle>Convidar pessoa</CardTitle>
          <CardDescription>
            Geramos um link seguro para você enviar pelo WhatsApp ou e-mail. A pessoa cria a conta (ou entra) com o mesmo e-mail e
            passa a ver apenas esta agência.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm canInviteOwner={ctx.role === "owner"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membros</CardTitle>
          <CardDescription>Mudanças de perfil e desativações ficam registradas na auditoria.</CardDescription>
        </CardHeader>
        <CardContent>
          <MembersList
            viewerIsOwner={ctx.role === "owner"}
            members={team.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, status: m.status, isSelf: m.id === ctx.memberId }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Convites pendentes</CardTitle>
        </CardHeader>
        <CardContent>
          <PendingInvites invites={invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>O que cada perfil faz</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {(Object.keys(ROLE_DESCRIPTIONS) as AgencyRole[]).map((role) => (
              <div key={role} className="rounded-lg border p-3">
                <dt className="font-medium">{ROLE_LABELS[role]}</dt>
                <dd className="text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
