import type { Metadata } from "next";

import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { SettingsBack } from "@/components/shared/settings-back";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseBusinessHours } from "@/modules/agencies/business-hours";
import { BusinessHoursForm } from "@/modules/agencies/components/business-hours-form";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Horários de atendimento" };

export default async function BusinessHoursPage() {
  const ctx = await requireTenant();
  const db = await createSupabaseServerClient();
  const { data: settings } = await db
    .from("agency_settings")
    .select("business_hours, timezone")
    .eq("agency_id", ctx.agencyId)
    .maybeSingle();

  return (
    <PageContainer className="max-w-3xl">
      <SettingsBack />
      <PageHeader title="Horários de atendimento" description="Quando a equipe humana está disponível." />
      <Card>
        <CardHeader>
          <CardTitle>Semana da agência</CardTitle>
          <CardDescription>
            Usado para avisar o cliente quando um consultor vai responder, agendar follow-ups em horário comercial e, na fase
            da IA, decidir quando transferir para um humano.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessHoursForm
            hours={parseBusinessHours(settings?.business_hours)}
            timezone={settings?.timezone ?? "America/Sao_Paulo"}
            readOnly={!can(ctx, "settings.manage")}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
