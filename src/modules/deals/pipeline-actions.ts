"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { validationError, type ActionState } from "@/lib/action-state";
import { requiredText } from "@/lib/form-fields";
import { ForbiddenError } from "@/lib/permissions";
import { getTenantContext, requirePermission, type TenantContext } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

import { STAGE_COLORS } from "./stage-colors";

const stageSchema = z.object({
  name: requiredText(2, 60, "Nome da etapa"),
  color: z.enum(STAGE_COLORS, "Cor inválida."),
});

async function authorize(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  requirePermission(ctx, "settings.manage");
  return ctx;
}

function done(message: string): ActionState {
  revalidatePath("/settings/pipeline");
  revalidatePath("/crm");
  return { status: "success", message };
}

function failure(error: unknown): ActionState {
  if (error instanceof ForbiddenError) return { status: "error", message: "Apenas donos e gerentes podem alterar etapas." };
  console.error("[pipeline] action failed", error instanceof Error ? error.message : error);
  return { status: "error", message: "Não foi possível salvar a etapa." };
}

async function loadStage(ctx: TenantContext, stageId: string) {
  const db = await createSupabaseServerClient();
  const { data } = await db
    .from("pipeline_stages")
    .select("id, pipeline_id, position, system_key, archived_at")
    .eq("agency_id", ctx.agencyId)
    .eq("id", z.uuid().parse(stageId))
    .maybeSingle();
  return { db, stage: data };
}

export async function updateStageAction(stageId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const parsed = stageSchema.safeParse({ name: formData.get("name"), color: formData.get("color") });
    if (!parsed.success) return validationError(parsed.error);
    const { db, stage } = await loadStage(ctx, stageId);
    if (!stage) return { status: "error", message: "Etapa não encontrada." };
    const { error } = await db.from("pipeline_stages").update(parsed.data).eq("agency_id", ctx.agencyId).eq("id", stage.id);
    if (error) throw new Error(error.message);
    return done("Etapa atualizada.");
  } catch (error) {
    return failure(error);
  }
}

export async function moveStageAction(stageId: string, direction: "up" | "down"): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const { db, stage } = await loadStage(ctx, stageId);
    if (!stage || stage.archived_at) return { status: "error", message: "Etapa não encontrada." };

    const { data: siblings, error } = await db
      .from("pipeline_stages")
      .select("id, position")
      .eq("agency_id", ctx.agencyId)
      .eq("pipeline_id", stage.pipeline_id)
      .is("archived_at", null)
      .order("position");
    if (error) throw new Error(error.message);

    const list = siblings ?? [];
    const index = list.findIndex((s) => s.id === stage.id);
    const target = list[direction === "up" ? index - 1 : index + 1];
    if (!target) return { status: "success" };

    // Rewrite positions sequentially so gaps or duplicates from earlier edits disappear.
    const reordered = [...list];
    [reordered[index], reordered[direction === "up" ? index - 1 : index + 1]] = [target, reordered[index]];
    for (const [i, s] of reordered.entries()) {
      if (s.position === i + 1) continue;
      const { error: updateError } = await db
        .from("pipeline_stages")
        .update({ position: i + 1 })
        .eq("agency_id", ctx.agencyId)
        .eq("id", s.id);
      if (updateError) throw new Error(updateError.message);
    }
    return done("Ordem atualizada.");
  } catch (error) {
    return failure(error);
  }
}

export async function addStageAction(pipelineId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const parsed = stageSchema.safeParse({ name: formData.get("name"), color: formData.get("color") || "slate" });
    if (!parsed.success) return validationError(parsed.error);
    const db = await createSupabaseServerClient();

    const { data: stages, error } = await db
      .from("pipeline_stages")
      .select("id, position, is_lost")
      .eq("agency_id", ctx.agencyId)
      .eq("pipeline_id", z.uuid().parse(pipelineId))
      .order("position");
    if (error) throw new Error(error.message);
    if (!stages?.length) return { status: "error", message: "Pipeline não encontrado." };
    if (stages.length >= 30) return { status: "error", message: "Limite de 30 etapas atingido." };

    // New custom stages go right before "Perdido" so the lost column stays last.
    const lost = stages.find((s) => s.is_lost);
    const position = lost ? lost.position : stages[stages.length - 1].position + 1;
    if (lost) {
      const { error: shiftError } = await db
        .from("pipeline_stages")
        .update({ position: lost.position + 1 })
        .eq("agency_id", ctx.agencyId)
        .eq("id", lost.id);
      if (shiftError) throw new Error(shiftError.message);
    }

    const { error: insertError } = await db.from("pipeline_stages").insert({
      agency_id: ctx.agencyId,
      pipeline_id: pipelineId,
      name: parsed.data.name,
      color: parsed.data.color,
      position,
    });
    if (insertError) throw new Error(insertError.message);
    return done("Etapa criada.");
  } catch (error) {
    return failure(error);
  }
}

/** Only custom stages can be archived, and only when no open deal is in them. */
export async function archiveStageAction(stageId: string): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const { db, stage } = await loadStage(ctx, stageId);
    if (!stage) return { status: "error", message: "Etapa não encontrada." };
    if (stage.system_key) return { status: "error", message: "Etapas padrão podem ser renomeadas, mas não removidas." };

    const { count, error } = await db
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", ctx.agencyId)
      .eq("stage_id", stage.id)
      .is("archived_at", null);
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 0) return { status: "error", message: "Mova os negócios desta etapa antes de removê-la." };

    const { error: archiveError } = await db
      .from("pipeline_stages")
      .update({ archived_at: new Date().toISOString() })
      .eq("agency_id", ctx.agencyId)
      .eq("id", stage.id);
    if (archiveError) throw new Error(archiveError.message);
    return done("Etapa removida.");
  } catch (error) {
    return failure(error);
  }
}
