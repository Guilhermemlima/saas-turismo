"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { formValues, validationError, type ActionState } from "@/lib/action-state";
import { ForbiddenError } from "@/lib/permissions";
import { getTenantContext, requirePermission, type TenantContext } from "@/server/auth/tenant";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/server/db/server-client";
import type { Json } from "@/server/db/database.types";

import { createQuoteForRequest, onQuoteReady } from "./repository";
import { autoItemTitle, itemDetailsSchemas, optionInputSchema, quoteHeaderSchema, quoteItemInputSchema } from "./schemas";

const id = z.uuid();

async function authorize(): Promise<{ ctx: TenantContext; db: SupabaseServerClient }> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  requirePermission(ctx, "quotes.write");
  return { ctx, db: await createSupabaseServerClient() };
}

function failure(error: unknown, values?: Record<string, string>): ActionState {
  const code = (error as { code?: string })?.code;
  if (error instanceof ForbiddenError) return { status: "error", message: "Seu perfil não edita cotações.", values };
  if (code === "55000") return { status: "error", message: "Esta cotação está pronta. Reabra para editar.", values };
  if (code === "23514") return { status: "error", message: "O desconto não pode ser maior que o total da opção.", values };
  if (error instanceof z.ZodError) return { status: "error", message: error.issues[0]?.message ?? "Dados inválidos.", values };
  console.error("[quotes] action failed", error instanceof Error ? error.message : error);
  return { status: "error", message: "Não foi possível salvar a cotação.", values };
}

/** Postgrest errors keep their SQLSTATE so `failure` can translate them. */
function check(error: { code?: string; message: string } | null) {
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}

function refresh(quoteId: string) {
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/quotes");
  revalidatePath("/crm");
}

async function optionQuoteId(db: SupabaseServerClient, ctx: TenantContext, optionId: string) {
  const { data } = await db.from("quote_options").select("quote_id").eq("agency_id", ctx.agencyId).eq("id", id.parse(optionId)).maybeSingle();
  if (!data) throw new Error("option not found");
  return data.quote_id;
}

export async function createQuoteAction(requestId: string): Promise<ActionState> {
  let quoteId: string | null;
  try {
    const { ctx, db } = await authorize();
    quoteId = await createQuoteForRequest(db, ctx, id.parse(requestId));
    if (!quoteId) return { status: "error", message: "Solicitação não encontrada." };
    revalidatePath(`/requests/${requestId}`);
    revalidatePath("/crm");
  } catch (error) {
    return failure(error);
  }
  redirect(`/quotes/${quoteId}`);
}

export async function updateQuoteHeaderAction(quoteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const { ctx, db } = await authorize();
    const parsed = quoteHeaderSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error, values);
    const { error } = await db.from("quotes").update(parsed.data).eq("agency_id", ctx.agencyId).eq("id", id.parse(quoteId));
    check(error);
    refresh(quoteId);
    return { status: "success", message: "Cotação atualizada." };
  } catch (error) {
    return failure(error, values);
  }
}

export async function setQuoteStatusAction(quoteId: string, status: "draft" | "ready" | "archived"): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const { data: quote } = await db
      .from("quotes")
      .select("id, deal_id, status, options:quote_options ( id, items:quote_items ( id ) )")
      .eq("agency_id", ctx.agencyId)
      .eq("id", id.parse(quoteId))
      .maybeSingle()
      .overrideTypes<{ id: string; deal_id: string; status: string; options: { id: string; items: { id: string }[] }[] }, { merge: false }>();
    if (!quote) return { status: "error", message: "Cotação não encontrada." };
    if (status === "ready" && !quote.options.some((o) => o.items.length > 0)) {
      return { status: "error", message: "Adicione ao menos um item antes de marcar como pronta." };
    }

    const { error } = await db.from("quotes").update({ status }).eq("agency_id", ctx.agencyId).eq("id", quote.id);
    check(error);
    const advanced = status === "ready" ? await onQuoteReady(db, ctx, quote) : false;
    refresh(quoteId);
    revalidatePath("/tasks");
    const messages = {
      ready: advanced ? "Cotação pronta! O negócio avançou para “Cotação pronta”." : "Cotação marcada como pronta.",
      draft: "Cotação reaberta para edição.",
      archived: "Cotação arquivada.",
    };
    return { status: "success", message: messages[status] };
  } catch (error) {
    return failure(error);
  }
}

export async function addOptionAction(quoteId: string): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const { count } = await db.from("quote_options").select("id", { count: "exact", head: true }).eq("agency_id", ctx.agencyId).eq("quote_id", id.parse(quoteId));
    if ((count ?? 0) >= 6) return { status: "error", message: "Máximo de 6 opções por cotação." };
    const { error } = await db
      .from("quote_options")
      .insert({ agency_id: ctx.agencyId, quote_id: quoteId, title: `Opção ${(count ?? 0) + 1}`, position: (count ?? 0) + 1 });
    check(error);
    refresh(quoteId);
    return { status: "success", message: "Opção adicionada." };
  } catch (error) {
    return failure(error);
  }
}

export async function duplicateOptionAction(optionId: string): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const { data: option } = await db
      .from("quote_options")
      .select("*, items:quote_items ( * )")
      .eq("agency_id", ctx.agencyId)
      .eq("id", id.parse(optionId))
      .maybeSingle()
      .overrideTypes<{ quote_id: string; title: string; description: string | null; service_fee_cents: number; discount_cents: number; items: Record<string, unknown>[] }, { merge: false }>();
    if (!option) return { status: "error", message: "Opção não encontrada." };

    const { count } = await db.from("quote_options").select("id", { count: "exact", head: true }).eq("agency_id", ctx.agencyId).eq("quote_id", option.quote_id);
    if ((count ?? 0) >= 6) return { status: "error", message: "Máximo de 6 opções por cotação." };

    const { data: copy, error } = await db
      .from("quote_options")
      .insert({
        agency_id: ctx.agencyId,
        quote_id: option.quote_id,
        title: `${option.title} (cópia)`.slice(0, 120),
        description: option.description,
        service_fee_cents: option.service_fee_cents,
        discount_cents: option.discount_cents,
        position: (count ?? 0) + 1,
      })
      .select("id")
      .single();
    check(error);

    if (option.items.length) {
      const items = option.items.map((item) => {
        const { id: _id, price_cents: _price, created_at: _c, updated_at: _u, option_id: _o, ...rest } = item;
        return { ...rest, option_id: copy!.id, agency_id: ctx.agencyId };
      });
      const { error: itemsError } = await db.from("quote_items").insert(items as never);
      check(itemsError);
    }
    refresh(option.quote_id);
    return { status: "success", message: "Opção duplicada." };
  } catch (error) {
    return failure(error);
  }
}

export async function updateOptionAction(optionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const { ctx, db } = await authorize();
    const parsed = optionInputSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error, values);
    const quoteId = await optionQuoteId(db, ctx, optionId);
    const { error } = await db.from("quote_options").update(parsed.data).eq("agency_id", ctx.agencyId).eq("id", optionId);
    check(error);
    refresh(quoteId);
    return { status: "success", message: "Opção atualizada." };
  } catch (error) {
    return failure(error, values);
  }
}

export async function deleteOptionAction(optionId: string): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const quoteId = await optionQuoteId(db, ctx, optionId);
    const { count } = await db.from("quote_options").select("id", { count: "exact", head: true }).eq("agency_id", ctx.agencyId).eq("quote_id", quoteId);
    if ((count ?? 0) <= 1) return { status: "error", message: "A cotação precisa de pelo menos uma opção." };
    const { error } = await db.from("quote_options").delete().eq("agency_id", ctx.agencyId).eq("id", optionId);
    check(error);
    refresh(quoteId);
    return { status: "success", message: "Opção removida." };
  } catch (error) {
    return failure(error);
  }
}

/** Creates or updates an item. Type-specific details come as `d_*` fields and are validated per type. */
export async function saveItemAction(optionId: string, itemId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const { ctx, db } = await authorize();
    const parsed = quoteItemInputSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error, values);

    const rawDetails = Object.fromEntries(Object.entries(values).filter(([k]) => k.startsWith("d_")).map(([k, v]) => [k.slice(2), v]));
    const details = itemDetailsSchemas[parsed.data.item_type].safeParse(rawDetails);
    if (!details.success) {
      const issue = details.error.issues[0];
      const field = `d_${String(issue?.path[0] ?? "")}`;
      return { status: "error", message: "Revise os campos destacados.", fieldErrors: { [field]: [issue?.message ?? "Valor inválido."] }, values };
    }

    const quoteId = await optionQuoteId(db, ctx, optionId);
    const row = {
      ...parsed.data,
      title: parsed.data.title ?? autoItemTitle(parsed.data.item_type, details.data),
      details: details.data as Json,
    };

    if (itemId) {
      const { error } = await db.from("quote_items").update(row).eq("agency_id", ctx.agencyId).eq("id", id.parse(itemId)).eq("option_id", optionId);
      check(error);
    } else {
      const { count } = await db.from("quote_items").select("id", { count: "exact", head: true }).eq("agency_id", ctx.agencyId).eq("option_id", optionId);
      if ((count ?? 0) >= 40) return { status: "error", message: "Máximo de 40 itens por opção.", values };
      const { error } = await db.from("quote_items").insert({ ...row, agency_id: ctx.agencyId, option_id: optionId, position: (count ?? 0) + 1 });
      check(error);
    }
    refresh(quoteId);
    return { status: "success", message: itemId ? "Item atualizado." : "Item adicionado.", payload: { nonce: crypto.randomUUID() } };
  } catch (error) {
    return failure(error, values);
  }
}

export async function deleteItemAction(itemId: string): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize();
    const { data, error } = await db
      .from("quote_items")
      .delete()
      .eq("agency_id", ctx.agencyId)
      .eq("id", id.parse(itemId))
      .select("option_id")
      .maybeSingle();
    check(error);
    if (!data) return { status: "error", message: "Item não encontrado." };
    refresh(await optionQuoteId(db, ctx, data.option_id));
    return { status: "success", message: "Item removido." };
  } catch (error) {
    return failure(error);
  }
}
