"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { formValues, validationError, type ActionState } from "@/lib/action-state";
import { ForbiddenError } from "@/lib/permissions";
import { getTenantContext, requirePermission, type TenantContext } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

import { maxDiscount, optionTotals } from "./pricing";
import {
  addOption,
  createQuote,
  deleteItem,
  deleteOption,
  duplicateOption,
  getDealForQuote,
  getItem,
  getOption,
  getQuote,
  saveItem,
  setQuoteStatus,
  updateOption,
  updateQuote,
} from "./repository";
import { optionInputSchema, parseItemForm, quoteCreateSchema, quoteUpdateSchema } from "./schemas";

const idSchema = z.uuid();
const MAX_OPTIONS = 10;
const MAX_ITEMS_PER_OPTION = 60;

async function authorize(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  requirePermission(ctx, "quotes.write");
  return ctx;
}

/** Database rules (migration 0014) surface as SQLSTATE codes; translate them for the user. */
function failure(error: unknown, values?: Record<string, string>): ActionState {
  unstable_rethrow(error);
  if (error instanceof ForbiddenError) return { status: "error", message: "Você não tem permissão para esta ação.", values };
  const code = (error as { code?: string } | null)?.code;
  if (code === "55000") return { status: "error", message: "A cotação não está em montagem. Reabra-a para editar.", values };
  if (code === "23514") return { status: "error", message: "O desconto não pode ser maior que o valor da opção.", values };
  console.error("[quotes] action failed", error instanceof Error ? error.message : error);
  return { status: "error", message: "Não foi possível salvar. Tente novamente.", values };
}

function refresh(quoteId: string) {
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
}

async function loadDraft(ctx: TenantContext, quoteId: string) {
  const db = await createSupabaseServerClient();
  const quote = await getQuote(db, ctx, idSchema.parse(quoteId));
  return { db, quote };
}

const LOCKED: ActionState = { status: "error", message: "A cotação não está em montagem. Reabra-a para editar." };
const NOT_FOUND: ActionState = { status: "error", message: "Cotação não encontrada." };

export async function createQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  let quoteId: string;
  try {
    const ctx = await authorize();
    const parsed = quoteCreateSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error, values);

    const db = await createSupabaseServerClient();
    const deal = await getDealForQuote(db, ctx, parsed.data.deal_id);
    if (!deal || deal.archived_at || !deal.customer) {
      return { status: "error", message: "Revise os campos destacados.", fieldErrors: { deal_id: ["Negócio não encontrado."] }, values };
    }
    quoteId = await createQuote(
      db,
      ctx,
      { id: deal.id, customerId: deal.customer.id, assignedMemberId: deal.assigned_member_id },
      parsed.data,
    );
    revalidatePath("/crm");
    revalidatePath("/tasks");
  } catch (error) {
    return failure(error, values);
  }
  revalidatePath("/quotes");
  redirect(`/quotes/${quoteId}?created=1`);
}

export async function updateQuoteAction(quoteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const ctx = await authorize();
    const parsed = quoteUpdateSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error, values);

    const { db, quote } = await loadDraft(ctx, quoteId);
    if (!quote) return NOT_FOUND;
    if (quote.status !== "draft") return LOCKED;
    const hasItems = quote.options.some((o) => o.items_count > 0);
    if (hasItems && parsed.data.currency !== quote.currency) {
      return { status: "error", message: "Revise os campos destacados.", fieldErrors: { currency: ["Remova os itens para trocar a moeda."] }, values };
    }
    await updateQuote(db, ctx, quote.id, parsed.data);
    refresh(quote.id);
    return { status: "success", message: "Cotação atualizada." };
  } catch (error) {
    return failure(error, values);
  }
}

export async function setQuoteStatusAction(quoteId: string, status: "draft" | "ready" | "archived"): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const { db, quote } = await loadDraft(ctx, quoteId);
    if (!quote) return NOT_FOUND;
    if (status === "ready" && !quote.options.some((o) => o.items_count > 0)) {
      return { status: "error", message: "Adicione ao menos um item em uma opção antes de marcar como pronta." };
    }
    await setQuoteStatus(db, ctx, quote.id, status);
    refresh(quote.id);
    revalidatePath("/crm");
    revalidatePath("/tasks");
    const messages = {
      ready: "Cotação pronta! O negócio avançou para “Cotação pronta”.",
      draft: "Cotação reaberta para edição.",
      archived: "Cotação arquivada.",
    };
    return { status: "success", message: messages[status] };
  } catch (error) {
    return failure(error);
  }
}

// Options ------------------------------------------------------------------------------------------------
export async function addOptionAction(quoteId: string): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const { db, quote } = await loadDraft(ctx, quoteId);
    if (!quote) return NOT_FOUND;
    if (quote.status !== "draft") return LOCKED;
    if (quote.options.length >= MAX_OPTIONS) return { status: "error", message: `Máximo de ${MAX_OPTIONS} opções por cotação.` };
    await addOption(db, ctx, quote.id);
    refresh(quote.id);
    return { status: "success", message: "Opção adicionada." };
  } catch (error) {
    return failure(error);
  }
}

export async function duplicateOptionAction(optionId: string): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const db = await createSupabaseServerClient();
    const option = await getOption(db, ctx, idSchema.parse(optionId));
    if (!option) return { status: "error", message: "Opção não encontrada." };
    const quote = await getQuote(db, ctx, option.quote_id);
    if (!quote) return NOT_FOUND;
    if (quote.status !== "draft") return LOCKED;
    if (quote.options.length >= MAX_OPTIONS) return { status: "error", message: `Máximo de ${MAX_OPTIONS} opções por cotação.` };
    await duplicateOption(db, ctx, option);
    refresh(quote.id);
    return { status: "success", message: "Opção duplicada com todos os itens." };
  } catch (error) {
    return failure(error);
  }
}

export async function updateOptionAction(optionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const ctx = await authorize();
    const parsed = optionInputSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error, values);

    const db = await createSupabaseServerClient();
    const option = await getOption(db, ctx, idSchema.parse(optionId));
    if (!option) return { status: "error", message: "Opção não encontrada.", values };

    const totals = optionTotals(option.items, { service_fee_cents: parsed.data.service_fee_cents, discount_cents: 0 });
    if (parsed.data.discount_cents > maxDiscount(totals.subtotal_cents, parsed.data.service_fee_cents)) {
      return {
        status: "error",
        message: "Revise os campos destacados.",
        fieldErrors: { discount_cents: ["O desconto não pode ser maior que o valor da opção."] },
        values,
      };
    }
    await updateOption(db, ctx, option.id, parsed.data);
    refresh(option.quote_id);
    return { status: "success", message: "Opção atualizada." };
  } catch (error) {
    return failure(error, values);
  }
}

export async function deleteOptionAction(optionId: string): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const db = await createSupabaseServerClient();
    const option = await getOption(db, ctx, idSchema.parse(optionId));
    if (!option) return { status: "error", message: "Opção não encontrada." };
    const quote = await getQuote(db, ctx, option.quote_id);
    if (quote && quote.options.length <= 1) return { status: "error", message: "A cotação precisa de ao menos uma opção." };
    await deleteOption(db, ctx, option.id);
    refresh(option.quote_id);
    return { status: "success", message: "Opção removida." };
  } catch (error) {
    return failure(error);
  }
}

// Items --------------------------------------------------------------------------------------------------
function itemFormObject(formData: FormData): Record<string, unknown> {
  const object: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("$ACTION") && typeof value === "string") object[key] = value;
  }
  return object;
}

/** Creates (itemId = null) or updates an item of the option. */
export async function saveItemAction(optionId: string, itemId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const ctx = await authorize();
    const parsed = parseItemForm(itemFormObject(formData));
    if (!parsed.success) return validationError(parsed.error, values);

    const db = await createSupabaseServerClient();
    const option = await getOption(db, ctx, idSchema.parse(optionId));
    if (!option) return { status: "error", message: "Opção não encontrada.", values };
    if (itemId !== null) {
      const id = idSchema.parse(itemId);
      if (!option.items.some((i) => i.id === id)) return { status: "error", message: "Item não encontrado.", values };
    } else if (option.items.length >= MAX_ITEMS_PER_OPTION) {
      return { status: "error", message: `Máximo de ${MAX_ITEMS_PER_OPTION} itens por opção.`, values };
    }

    // Removing value from an option must not leave its discount above the new total.
    const nextItems = [...option.items.filter((i) => i.id !== itemId), parsed.data];
    const totals = optionTotals(nextItems, { service_fee_cents: option.service_fee_cents, discount_cents: 0 });
    if (option.discount_cents > maxDiscount(totals.subtotal_cents, option.service_fee_cents)) {
      return { status: "error", message: "Com esse valor, o desconto da opção ficaria maior que o total. Ajuste o desconto primeiro.", values };
    }

    const position = option.items.reduce((max, i) => Math.max(max, i.position), -1) + 1;
    await saveItem(db, ctx, { optionId: option.id, itemId, position }, parsed.data);
    refresh(option.quote_id);
    return { status: "success", message: itemId ? "Item atualizado." : "Item adicionado.", payload: { nonce: crypto.randomUUID() } };
  } catch (error) {
    return failure(error, values);
  }
}

export async function deleteItemAction(itemId: string): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const db = await createSupabaseServerClient();
    const item = await getItem(db, ctx, idSchema.parse(itemId));
    if (!item?.option) return { status: "error", message: "Item não encontrado." };
    const option = await getOption(db, ctx, item.quote_option_id);
    if (option) {
      const remaining = option.items.filter((i) => i.id !== item.id);
      const totals = optionTotals(remaining, { service_fee_cents: option.service_fee_cents, discount_cents: 0 });
      if (option.discount_cents > maxDiscount(totals.subtotal_cents, option.service_fee_cents)) {
        return { status: "error", message: "Sem esse item, o desconto da opção ficaria maior que o total. Ajuste o desconto primeiro." };
      }
    }
    await deleteItem(db, ctx, item.id);
    refresh(item.option.quote_id);
    return { status: "success", message: "Item removido." };
  } catch (error) {
    return failure(error);
  }
}
