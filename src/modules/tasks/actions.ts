"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { formValues, validationError, type ActionState } from "@/lib/action-state";
import { ForbiddenError } from "@/lib/permissions";
import { getTenantContext, requirePermission, type TenantContext } from "@/server/auth/tenant";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/server/db/server-client";

import { taskInputSchema, zonedLocalToIso } from "./schemas";

async function authorize(): Promise<{ ctx: TenantContext; db: SupabaseServerClient }> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  requirePermission(ctx, "tasks.write");
  return { ctx, db: await createSupabaseServerClient() };
}

function failure(error: unknown, values?: Record<string, string>): ActionState {
  if (error instanceof ForbiddenError) return { status: "error", message: "Seu perfil não gerencia tarefas.", values };
  console.error("[tasks] action failed", error instanceof Error ? error.message : error);
  return { status: "error", message: "Não foi possível salvar a tarefa.", values };
}

function refresh(customerId?: string | null) {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

async function agencyTimeZone(db: SupabaseServerClient, ctx: TenantContext) {
  const { data } = await db.from("agency_settings").select("timezone").eq("agency_id", ctx.agencyId).maybeSingle();
  return data?.timezone ?? "America/Sao_Paulo";
}

export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const { ctx, db } = await authorize();
    const parsed = taskInputSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error, values);
    const { due_local, ...task } = parsed.data;

    const { error } = await db.from("tasks").insert({
      ...task,
      agency_id: ctx.agencyId,
      assigned_member_id: task.assigned_member_id ?? ctx.memberId,
      due_at: due_local ? zonedLocalToIso(due_local, await agencyTimeZone(db, ctx)) : null,
      created_by: ctx.userId,
    });
    if (error) {
      if (error.code === "23503") return { status: "error", message: "Cliente ou responsável inválido.", values };
      if (error.code === "23505") return { status: "error", message: "Já existe uma tarefa de cotação aberta para este negócio.", values };
      throw new Error(error.message);
    }
    refresh(task.customer_id);
    return { status: "success", message: "Tarefa criada.", payload: { nonce: crypto.randomUUID() } };
  } catch (error) {
    return failure(error, values);
  }
}

export async function setTaskStatusAction(taskId: string, status: "open" | "done" | "cancelled"): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const { data, error } = await db
      .from("tasks")
      .update({ status: z.enum(["open", "done", "cancelled"]).parse(status) })
      .eq("agency_id", ctx.agencyId)
      .eq("id", z.uuid().parse(taskId))
      .select("customer_id")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return { status: "error", message: "Já existe outra tarefa de cotação aberta para este negócio." };
      throw new Error(error.message);
    }
    if (!data) return { status: "error", message: "Tarefa não encontrada." };
    refresh(data.customer_id);
    return { status: "success", message: status === "done" ? "Tarefa concluída." : status === "open" ? "Tarefa reaberta." : "Tarefa cancelada." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteTaskAction(taskId: string): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const { data, error } = await db
      .from("tasks")
      .delete()
      .eq("agency_id", ctx.agencyId)
      .eq("id", z.uuid().parse(taskId))
      .select("customer_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { status: "error", message: "Só quem criou a tarefa, o dono ou o gerente podem excluí-la." };
    refresh(data.customer_id);
    return { status: "success", message: "Tarefa excluída." };
  } catch (error) {
    return failure(error);
  }
}
