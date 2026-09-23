"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { formValues, validationError, type ActionState } from "@/lib/action-state";
import { ForbiddenError } from "@/lib/permissions";
import { getTenantContext, requirePermission, type TenantContext } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

import {
  createCustomer,
  DuplicatePhoneError,
  setCustomerArchived,
  updateCustomer,
} from "./repository";
import { customerInputSchema } from "./schemas";

const idSchema = z.uuid();

async function authorize(permission: Parameters<typeof requirePermission>[1]): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  requirePermission(ctx, permission);
  return ctx;
}

function failure(error: unknown, values?: Record<string, string>): ActionState {
  unstable_rethrow(error); // let redirect()/notFound() propagate
  if (error instanceof DuplicatePhoneError) {
    return { status: "error", message: error.message, fieldErrors: { phone_e164: [error.message] }, values };
  }
  if (error instanceof ForbiddenError) {
    return { status: "error", message: "Você não tem permissão para esta ação.", values };
  }
  console.error("[customers] action failed", error instanceof Error ? error.message : error);
  return { status: "error", message: "Não foi possível salvar. Tente novamente.", values };
}

export async function createCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  let customerId: string;
  try {
    const ctx = await authorize("customers.write");
    const parsed = customerInputSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error, values);

    const db = await createSupabaseServerClient();
    customerId = (await createCustomer(db, ctx, parsed.data)).id;
  } catch (error) {
    return failure(error, values);
  }
  revalidatePath("/customers");
  redirect(`/customers/${customerId}?created=1`);
}

export async function updateCustomerAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const ctx = await authorize("customers.write");
    const customerId = idSchema.parse(id);
    const parsed = customerInputSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error, values);

    const db = await createSupabaseServerClient();
    const updated = await updateCustomer(db, ctx, customerId, parsed.data);
    if (!updated) return { status: "error", message: "Cliente não encontrado.", values };
  } catch (error) {
    return failure(error, values);
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { status: "success", message: "Alterações salvas." };
}

export async function setCustomerArchivedAction(id: string, archived: boolean): Promise<ActionState> {
  try {
    const ctx = await authorize("customers.archive");
    const customerId = idSchema.parse(id);
    const db = await createSupabaseServerClient();
    const result = await setCustomerArchived(db, ctx, customerId, archived);
    if (!result) return { status: "error", message: "Cliente não encontrado." };
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { status: "success", message: archived ? "Cliente arquivado." : "Cliente restaurado." };
}
