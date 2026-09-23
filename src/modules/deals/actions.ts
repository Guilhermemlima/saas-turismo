"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { ForbiddenError } from "@/lib/permissions";
import { getTenantContext, requirePermission } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

import { moveDealToStage } from "./repository";

const moveSchema = z.object({ dealId: z.uuid(), stageId: z.uuid() });

export async function moveDealStageAction(dealId: string, stageId: string): Promise<ActionState> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");

  try {
    requirePermission(ctx, "deals.write");
    const input = moveSchema.parse({ dealId, stageId });
    const db = await createSupabaseServerClient();
    const result = await moveDealToStage(db, ctx, input.dealId, input.stageId);
    if (!result.ok) {
      return { status: "error", message: result.reason === "not_found" ? "Negócio não encontrado." : "Etapa inválida." };
    }
    revalidatePath("/crm");
    revalidatePath("/requests");
    return { status: "success", message: result.stage ? `Movido para “${result.stage.name}”.` : undefined };
  } catch (error) {
    if (error instanceof ForbiddenError) return { status: "error", message: "Você não tem permissão para mover negócios." };
    console.error("[deals] move failed", error instanceof Error ? error.message : error);
    return { status: "error", message: "Não foi possível mover o negócio." };
  }
}
