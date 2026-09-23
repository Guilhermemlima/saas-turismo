"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { ForbiddenError } from "@/lib/permissions";
import { getTenantContext, requirePermission, type TenantContext } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

const id = z.uuid();
const body = z.string().trim().min(1, "Escreva uma mensagem.").max(4096, "Mensagem longa demais (máx. 4096 caracteres).");

async function authorize(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  requirePermission(ctx, "conversations.read");
  return ctx;
}

function failure(error: unknown): ActionState {
  if (error instanceof ForbiddenError) return { status: "error", message: "Seu perfil não acessa atendimentos." };
  if (error instanceof z.ZodError) return { status: "error", message: error.issues[0]?.message ?? "Dados inválidos." };
  console.error("[inbox] action failed", error instanceof Error ? error.message : error);
  return { status: "error", message: "Não foi possível concluir. Tente novamente." };
}

function refresh(conversationId?: string) {
  revalidatePath("/inbox", "layout");
  if (conversationId) revalidatePath(`/inbox/${conversationId}`);
}

export async function sendMessageAction(conversationId: string, text: string, asCustomer = false): Promise<ActionState> {
  try {
    await authorize();
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("post_conversation_message", {
      p_conversation_id: id.parse(conversationId),
      p_body: body.parse(text),
      p_as_customer: asCustomer,
    });
    if (error) {
      if (error.message.includes("only be simulated")) return { status: "error", message: "Mensagens do cliente só podem ser simuladas em conversas de teste." };
      throw new Error(error.message);
    }
    refresh(conversationId);
    return { status: "success" };
  } catch (error) {
    return failure(error);
  }
}

/** Take over (human) or hand back to the AI. Handing back is blocked until the AI agent exists. */
export async function setConversationModeAction(conversationId: string, mode: "human" | "ai"): Promise<ActionState> {
  try {
    const ctx = await authorize();
    if (mode === "ai") return { status: "error", message: "O agente de IA ainda não está ativo (fase 13)." };
    const db = await createSupabaseServerClient();
    const { error } = await db
      .from("conversations")
      .update({ mode, assigned_member_id: ctx.memberId, handoff_reason: "manual_takeover", handoff_at: new Date().toISOString() })
      .eq("agency_id", ctx.agencyId)
      .eq("id", id.parse(conversationId));
    if (error) throw new Error(error.message);
    refresh(conversationId);
    return { status: "success", message: "Você assumiu o atendimento." };
  } catch (error) {
    return failure(error);
  }
}

export async function assignConversationAction(conversationId: string, memberId: string | null): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const db = await createSupabaseServerClient();
    const { error } = await db
      .from("conversations")
      .update({ assigned_member_id: memberId ? id.parse(memberId) : null })
      .eq("agency_id", ctx.agencyId)
      .eq("id", id.parse(conversationId));
    if (error) throw new Error(error.message);
    refresh(conversationId);
    return { status: "success", message: "Responsável atualizado." };
  } catch (error) {
    return failure(error);
  }
}

export async function markConversationReadAction(conversationId: string): Promise<void> {
  const ctx = await getTenantContext();
  if (!ctx) return;
  const db = await createSupabaseServerClient();
  await db.from("conversations").update({ unread_count: 0 }).eq("agency_id", ctx.agencyId).eq("id", conversationId).gt("unread_count", 0);
  revalidatePath("/inbox", "layout");
}

export async function setConversationClosedAction(conversationId: string, closed: boolean): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const db = await createSupabaseServerClient();
    const { error } = await db
      .from("conversations")
      .update({ status: closed ? "closed" : "open", closed_at: closed ? new Date().toISOString() : null })
      .eq("agency_id", ctx.agencyId)
      .eq("id", id.parse(conversationId));
    if (error) {
      if (error.code === "23505") return { status: "error", message: "Já existe outra conversa aberta com este cliente neste canal." };
      throw new Error(error.message);
    }
    refresh(conversationId);
    return { status: "success", message: closed ? "Conversa encerrada." : "Conversa reaberta." };
  } catch (error) {
    return failure(error);
  }
}

export async function startSimulationAction(customerId: string): Promise<ActionState> {
  let conversationId: string;
  try {
    await authorize();
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc("start_simulated_conversation", { p_customer_id: id.parse(customerId) });
    if (error || !data) throw new Error(error?.message ?? "no conversation");
    conversationId = data;
  } catch (error) {
    return failure(error);
  }
  refresh();
  redirect(`/inbox/${conversationId}`);
}
