import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StageEditor } from "@/modules/deals/components/stage-editor";
import { getDefaultPipeline, listStages } from "@/modules/deals/repository";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "Etapas do pipeline" };

export default async function PipelineSettingsPage() {
  const ctx = await requireTenant();
  if (!can(ctx, "settings.manage")) redirect("/crm");

  const db = await createSupabaseServerClient();
  const pipeline = await getDefaultPipeline(db, ctx);
  if (!pipeline) redirect("/crm");

  const [stages, { data: deals }] = await Promise.all([
    listStages(db, ctx, pipeline.id),
    db.from("deals").select("stage_id").eq("agency_id", ctx.agencyId).eq("pipeline_id", pipeline.id).is("archived_at", null),
  ]);
  const counts = new Map<string, number>();
  for (const d of deals ?? []) counts.set(d.stage_id, (counts.get(d.stage_id) ?? 0) + 1);

  return (
    <PageContainer className="max-w-4xl">
      <Link href="/crm" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft /> CRM
      </Link>
      <PageHeader title="Etapas do pipeline" description={pipeline.name} />
      <Card>
        <CardHeader>
          <CardTitle>Personalize o funil da sua agência</CardTitle>
          <CardDescription>
            Renomeie, mude a cor e a ordem das etapas. As 13 etapas padrão não podem ser removidas porque automações,
            lead score e relatórios dependem delas; etapas que você criar podem ser removidas quando estiverem vazias.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StageEditor
            pipelineId={pipeline.id}
            stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color, systemKey: s.system_key, dealCount: counts.get(s.id) ?? 0 }))}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
