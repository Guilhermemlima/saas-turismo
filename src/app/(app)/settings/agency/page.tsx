import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { SettingsBack } from "@/components/shared/settings-back";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { publicStorageUrl } from "@/lib/storage";
import { AgencyProfileForm, LogoUploader, SpecialtiesForm } from "@/modules/agencies/components/agency-settings-forms";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Dados da agência" };

export default async function AgencySettingsPage() {
  const ctx = await requireTenant();
  const db = await createSupabaseServerClient();
  const { data: agency } = await db
    .from("agencies")
    .select("name, cnpj, phone_e164, email, website, instagram, city, state, logo_path, specialties, specialty_scopes")
    .eq("id", ctx.agencyId)
    .maybeSingle();
  if (!agency) notFound();

  const readOnly = !can(ctx, "agency.manage");

  return (
    <PageContainer className="max-w-4xl">
      <SettingsBack />
      <PageHeader
        title="Dados da agência"
        description={readOnly ? "Somente o dono da agência pode alterar estes dados." : "Informações usadas no painel, nas propostas e pelo agente de IA."}
      />

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent>
          <LogoUploader logoUrl={publicStorageUrl("agency-logos", agency.logo_path)} readOnly={readOnly} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações</CardTitle>
        </CardHeader>
        <CardContent>
          <AgencyProfileForm defaults={agency} readOnly={readOnly} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Especialidades</CardTitle>
          <CardDescription>Ajudam a IA a apresentar a agência e a priorizar o que vocês vendem melhor.</CardDescription>
        </CardHeader>
        <CardContent>
          <SpecialtiesForm specialties={agency.specialties} scopes={agency.specialty_scopes} readOnly={readOnly} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
