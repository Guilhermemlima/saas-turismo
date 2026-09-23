"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { ForbiddenError } from "@/lib/permissions";
import { STAGE_COLORS } from "@/modules/deals/stage-colors";
import { getTenantContext, requirePermission, type TenantContext } from "@/server/auth/tenant";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/server/db/server-client";

import { PREFERENCE_CATEGORIES } from "./labels";

const id = z.uuid();

async function authorize(): Promise<{ ctx: TenantContext; db: SupabaseServerClient }> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  requirePermission(ctx, "customers.write");
  return { ctx, db: await createSupabaseServerClient() };
}

function failure(error: unknown): ActionState {
  if (error instanceof ForbiddenError) return { status: "error", message: "Seu perfil não edita clientes." };
  if (error instanceof z.ZodError) return { status: "error", message: error.issues[0]?.message ?? "Dados inválidos." };
  console.error("[customer-details] action failed", error instanceof Error ? error.message : error);
  return { status: "error", message: "Não foi possível salvar." };
}

function done(customerId: string, message?: string): ActionState {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { status: "success", message };
}

/** Applies a tag by name, creating it in the agency catalog when it does not exist yet. */
export async function addTagAction(customerId: string, rawName: string): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const name = z.string().trim().min(1, "Digite o nome da tag.").max(40, "Tag com até 40 caracteres.").parse(rawName);
    const customer = id.parse(customerId);

    const { data: existing } = await db.from("tags").select("id").eq("agency_id", ctx.agencyId).ilike("name", name.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
    let tagId = existing?.id;
    if (!tagId) {
      const color = STAGE_COLORS[Math.abs([...name.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % STAGE_COLORS.length];
      const { data, error } = await db.from("tags").insert({ agency_id: ctx.agencyId, name, color }).select("id").single();
      if (error) throw new Error(error.message);
      tagId = data.id;
    }

    const { error } = await db.from("customer_tags").insert({ agency_id: ctx.agencyId, customer_id: customer, tag_id: tagId });
    if (error && error.code !== "23505") throw new Error(error.message);
    return done(customer);
  } catch (error) {
    return failure(error);
  }
}

export async function removeTagAction(customerId: string, tagId: string): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const { error } = await db
      .from("customer_tags")
      .delete()
      .eq("agency_id", ctx.agencyId)
      .eq("customer_id", id.parse(customerId))
      .eq("tag_id", id.parse(tagId));
    if (error) throw new Error(error.message);
    return done(customerId);
  } catch (error) {
    return failure(error);
  }
}

export async function addNoteAction(customerId: string, body: string): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const text = z.string().trim().min(1, "Escreva a nota.").max(4000, "Nota com até 4000 caracteres.").parse(body);
    const { error } = await db.from("notes").insert({
      agency_id: ctx.agencyId,
      customer_id: id.parse(customerId),
      body: text,
      author_user_id: ctx.userId,
    });
    if (error) throw new Error(error.message);
    return done(customerId, "Nota adicionada.");
  } catch (error) {
    return failure(error);
  }
}

export async function deleteNoteAction(customerId: string, noteId: string): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const { data, error } = await db.from("notes").delete().eq("agency_id", ctx.agencyId).eq("id", id.parse(noteId)).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { status: "error", message: "Só o autor, o dono ou o gerente podem apagar esta nota." };
    return done(customerId, "Nota apagada.");
  } catch (error) {
    return failure(error);
  }
}

export async function addPreferenceAction(customerId: string, category: string, value: string): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const input = z
      .object({
        category: z.enum(PREFERENCE_CATEGORIES, "Categoria inválida."),
        value: z.string().trim().min(1, "Descreva a preferência.").max(200, "Preferência com até 200 caracteres."),
      })
      .parse({ category, value });
    const { error } = await db.from("customer_preferences").insert({
      agency_id: ctx.agencyId,
      customer_id: id.parse(customerId),
      category: input.category,
      value: input.value,
      created_by: ctx.userId,
    });
    if (error) {
      if (error.code === "23505") return { status: "error", message: "Essa preferência já está registrada." };
      throw new Error(error.message);
    }
    return done(customerId);
  } catch (error) {
    return failure(error);
  }
}

export async function deletePreferenceAction(customerId: string, preferenceId: string): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const { error } = await db.from("customer_preferences").delete().eq("agency_id", ctx.agencyId).eq("id", id.parse(preferenceId));
    if (error) throw new Error(error.message);
    return done(customerId);
  } catch (error) {
    return failure(error);
  }
}
