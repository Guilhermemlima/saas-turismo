"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { validationError, type ActionState } from "@/lib/action-state";
import { todayInTimeZone } from "@/lib/dates";
import { ForbiddenError } from "@/lib/permissions";
import { getTenantContext, requirePermission, type TenantContext } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

import { createTravelRequest, getTravelRequest, setTravelRequestStatus, updateTravelRequest } from "./repository";
import { travelRequestFormToObject, travelRequestInputSchema } from "./schemas";

const idSchema = z.uuid();

async function authorize(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  requirePermission(ctx, "requests.write");
  return ctx;
}

function echo(raw: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    values[key] = Array.isArray(value) ? value.join(",") : String(value ?? "");
  }
  return values;
}

function failure(error: unknown, values?: Record<string, string>): ActionState {
  unstable_rethrow(error);
  if (error instanceof ForbiddenError) return { status: "error", message: "Você não tem permissão para esta ação.", values };
  console.error("[travel-requests] action failed", error instanceof Error ? error.message : error);
  return { status: "error", message: "Não foi possível salvar. Tente novamente.", values };
}

async function agencyToday(ctx: TenantContext): Promise<string> {
  const db = await createSupabaseServerClient();
  const { data } = await db.from("agency_settings").select("timezone").eq("agency_id", ctx.agencyId).maybeSingle();
  return todayInTimeZone(data?.timezone ?? "America/Sao_Paulo");
}

export async function createTravelRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = travelRequestFormToObject(formData);
  const values = echo(raw);
  let requestId: string;
  try {
    const ctx = await authorize();
    const customerId = idSchema.safeParse(raw.customer_id);
    if (!customerId.success) {
      return { status: "error", message: "Revise os campos destacados.", fieldErrors: { customer_id: ["Selecione o cliente."] }, values };
    }
    const parsed = travelRequestInputSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error, values);

    // New trips cannot start in the past (agency time zone).
    if (parsed.data.departure_date && parsed.data.departure_date < (await agencyToday(ctx))) {
      return { status: "error", message: "Revise os campos destacados.", fieldErrors: { departure_date: ["A ida não pode ser no passado."] }, values };
    }

    const db = await createSupabaseServerClient();
    const { data: customer } = await db
      .from("customers")
      .select("id, full_name")
      .eq("agency_id", ctx.agencyId)
      .eq("id", customerId.data)
      .is("archived_at", null)
      .maybeSingle();
    if (!customer) {
      return { status: "error", message: "Revise os campos destacados.", fieldErrors: { customer_id: ["Cliente não encontrado."] }, values };
    }

    requestId = (await createTravelRequest(db, ctx, customer, parsed.data)).travel_request_id;
  } catch (error) {
    return failure(error, values);
  }
  revalidatePath("/requests");
  redirect(`/requests/${requestId}?created=1`);
}

export async function updateTravelRequestAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = travelRequestFormToObject(formData);
  const values = echo(raw);
  try {
    const ctx = await authorize();
    const requestId = idSchema.parse(id);
    const parsed = travelRequestInputSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error, values);

    const db = await createSupabaseServerClient();
    const current = await getTravelRequest(db, ctx, requestId);
    if (!current) return { status: "error", message: "Solicitação não encontrada.", values };
    if (current.status === "archived" || current.status === "cancelled") {
      return { status: "error", message: "Reabra a solicitação antes de editar.", values };
    }

    const result = await updateTravelRequest(db, ctx, current, parsed.data);
    revalidatePath("/requests");
    revalidatePath(`/requests/${requestId}`);
    revalidatePath(`/customers/${current.customer_id}`);
    return {
      status: "success",
      message: result.advancedStage
        ? "Solicitação completa! O negócio avançou para “Solicitação completa”."
        : "Alterações salvas.",
    };
  } catch (error) {
    return failure(error, values);
  }
}

export async function setTravelRequestArchivedAction(id: string, archived: boolean): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const db = await createSupabaseServerClient();
    const current = await getTravelRequest(db, ctx, idSchema.parse(id));
    if (!current) return { status: "error", message: "Solicitação não encontrada." };
    await setTravelRequestStatus(db, ctx, current, archived ? "archived" : "reopen");
    revalidatePath("/requests");
    revalidatePath(`/requests/${id}`);
    revalidatePath(`/customers/${current.customer_id}`);
    return { status: "success", message: archived ? "Solicitação arquivada." : "Solicitação reaberta." };
  } catch (error) {
    return failure(error);
  }
}
