"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { formValues, validationError, type ActionState } from "@/lib/action-state";
import { ForbiddenError, type Permission } from "@/lib/permissions";
import { detectImageType } from "@/lib/storage";
import { getTenantContext, requirePermission, type TenantContext } from "@/server/auth/tenant";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/server/db/server-client";

import { BRAZIL_TIMEZONES, businessHoursFromForm, businessHoursSchema, WEEKDAY_LABELS, type Weekday } from "./business-hours";
import { agencyProfileSchema, LOGO_MAX_BYTES, specialtiesSchema } from "./schemas";

const LOGO_BUCKET = "agency-logos";

async function authorize(permission: Permission): Promise<{ ctx: TenantContext; db: SupabaseServerClient }> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  requirePermission(ctx, permission);
  return { ctx, db: await createSupabaseServerClient() };
}

function failure(error: unknown, values?: Record<string, string>): ActionState {
  if (error instanceof ForbiddenError) return { status: "error", message: "Seu perfil não pode alterar esta configuração.", values };
  console.error("[agency-settings] action failed", error instanceof Error ? error.message : error);
  return { status: "error", message: "Não foi possível salvar. Tente novamente.", values };
}

async function markStep(db: SupabaseServerClient, ctx: TenantContext, step: number) {
  const { error } = await db.rpc("mark_onboarding_step", { p_agency: ctx.agencyId, p_step: step });
  if (error) console.warn("[agency-settings] could not mark onboarding step", step, error.message);
}

function refresh() {
  revalidatePath("/settings", "layout");
  revalidatePath("/dashboard");
}

export async function updateAgencyProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const { ctx, db } = await authorize("agency.manage");
    const parsed = agencyProfileSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error, values);

    const { error } = await db.from("agencies").update(parsed.data).eq("id", ctx.agencyId);
    if (error) throw new Error(error.message);
    await markStep(db, ctx, 1);
    refresh();
    return { status: "success", message: "Dados da agência salvos." };
  } catch (error) {
    return failure(error, values);
  }
}

export async function updateSpecialtiesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize("agency.manage");
    const parsed = specialtiesSchema.safeParse({
      specialties: formData.getAll("specialties"),
      specialty_scopes: formData.getAll("specialty_scopes"),
    });
    if (!parsed.success) return validationError(parsed.error);

    const { error } = await db.from("agencies").update(parsed.data).eq("id", ctx.agencyId);
    if (error) throw new Error(error.message);
    if (parsed.data.specialties.length > 0 || parsed.data.specialty_scopes.length > 0) await markStep(db, ctx, 3);
    refresh();
    return { status: "success", message: "Especialidades salvas." };
  } catch (error) {
    return failure(error);
  }
}

export async function uploadLogoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize("agency.manage");
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      return { status: "error", message: "Selecione uma imagem.", fieldErrors: { logo: ["Selecione uma imagem."] } };
    }
    if (file.size > LOGO_MAX_BYTES) {
      return { status: "error", message: "A imagem deve ter até 1 MB.", fieldErrors: { logo: ["A imagem deve ter até 1 MB."] } };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type) {
      return { status: "error", message: "Use PNG, JPG ou WebP.", fieldErrors: { logo: ["Use PNG, JPG ou WebP."] } };
    }

    // New random name on every upload: public URLs are cached, so replacing in place would show stale logos.
    const path = `${ctx.agencyId}/logo-${crypto.randomUUID().slice(0, 8)}.${type === "jpeg" ? "jpg" : type}`;
    const { error: uploadError } = await db.storage.from(LOGO_BUCKET).upload(path, bytes, {
      contentType: `image/${type}`,
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);

    const { data: agency } = await db.from("agencies").select("logo_path").eq("id", ctx.agencyId).maybeSingle();
    const { error } = await db.from("agencies").update({ logo_path: path }).eq("id", ctx.agencyId);
    if (error) {
      await db.storage.from(LOGO_BUCKET).remove([path]);
      throw new Error(error.message);
    }
    if (agency?.logo_path && agency.logo_path.startsWith(`${ctx.agencyId}/`)) {
      await db.storage.from(LOGO_BUCKET).remove([agency.logo_path]);
    }

    revalidatePath("/", "layout");
    return { status: "success", message: "Logo atualizado." };
  } catch (error) {
    return failure(error);
  }
}

export async function removeLogoAction(): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize("agency.manage");
    const { data: agency } = await db.from("agencies").select("logo_path").eq("id", ctx.agencyId).maybeSingle();
    const { error } = await db.from("agencies").update({ logo_path: null }).eq("id", ctx.agencyId);
    if (error) throw new Error(error.message);
    if (agency?.logo_path?.startsWith(`${ctx.agencyId}/`)) await db.storage.from(LOGO_BUCKET).remove([agency.logo_path]);
    revalidatePath("/", "layout");
    return { status: "success", message: "Logo removido." };
  } catch (error) {
    return failure(error);
  }
}

const timezoneSchema = z.enum(BRAZIL_TIMEZONES.map((t) => t.value) as [string, ...string[]], "Fuso horário inválido.");

export async function updateBusinessHoursAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { ctx, db } = await authorize("settings.manage");
    const timezone = timezoneSchema.safeParse(formData.get("timezone"));
    if (!timezone.success) return validationError(timezone.error);
    const hours = businessHoursSchema.safeParse(businessHoursFromForm(formData));
    if (!hours.success) {
      const day = hours.error.issues[0]?.path[0] as Weekday | undefined;
      const label = day ? WEEKDAY_LABELS[day] : "algum dia";
      return { status: "error", message: `Revise o horário de ${label}: ${hours.error.issues[0]?.message}` };
    }

    const { error } = await db
      .from("agency_settings")
      .update({ business_hours: hours.data, timezone: timezone.data })
      .eq("agency_id", ctx.agencyId);
    if (error) throw new Error(error.message);
    await markStep(db, ctx, 4);
    refresh();
    return { status: "success", message: "Horários salvos." };
  } catch (error) {
    return failure(error);
  }
}
