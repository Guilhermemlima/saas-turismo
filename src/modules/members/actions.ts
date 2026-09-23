"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { formValues, validationError, type ActionState } from "@/lib/action-state";
import { getAppUrl } from "@/lib/app-url";
import { ForbiddenError } from "@/lib/permissions";
import { ACTIVE_AGENCY_COOKIE, getCurrentUser, getTenantContext, requirePermission, type TenantContext } from "@/server/auth/tenant";
import type { AgencyRole } from "@/server/db/database.types";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { generateToken, hashToken, isWellFormedToken } from "@/server/security/tokens";

const ROLES = ["owner", "manager", "consultant", "attendant", "financial"] as const satisfies readonly AgencyRole[];

const inviteSchema = z.object({
  email: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""), z.email("E-mail inválido.")),
  role: z.enum(ROLES, "Perfil inválido."),
});

const memberUpdateSchema = z.object({
  memberId: z.uuid(),
  role: z.enum(ROLES, "Perfil inválido.").optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

async function authorize(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  requirePermission(ctx, "members.manage");
  return ctx;
}

function failure(error: unknown, values?: Record<string, string>): ActionState {
  if (error instanceof ForbiddenError) return { status: "error", message: "Apenas donos e gerentes gerenciam a equipe.", values };
  console.error("[members] action failed", error instanceof Error ? error.message : error);
  return { status: "error", message: "Não foi possível concluir. Tente novamente.", values };
}

/** Returns the invitation link once; only its hash is stored. The link is shared by the inviter (e.g. WhatsApp). */
export async function createInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  try {
    const ctx = await authorize();
    const parsed = inviteSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error, values);
    if (parsed.data.role === "owner" && ctx.role !== "owner") {
      return { status: "error", message: "Apenas donos podem convidar outro dono.", fieldErrors: { role: ["Apenas donos podem convidar outro dono."] }, values };
    }

    const db = await createSupabaseServerClient();

    const { data: existingMember } = await db
      .from("agency_members")
      .select("id, status, profile:profiles!inner ( email )")
      .eq("agency_id", ctx.agencyId)
      .eq("profile.email", parsed.data.email)
      .maybeSingle();
    if (existingMember?.status === "active") {
      return { status: "error", message: "Esta pessoa já faz parte da equipe.", fieldErrors: { email: ["Esta pessoa já faz parte da equipe."] }, values };
    }

    // An expired pending invitation would block a new one (one pending per e-mail): revoke it first.
    const { data: pending } = await db
      .from("agency_invitations")
      .select("id, expires_at")
      .eq("agency_id", ctx.agencyId)
      .eq("email", parsed.data.email)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .maybeSingle();
    if (pending && new Date(pending.expires_at) > new Date()) {
      return { status: "error", message: "Já existe um convite pendente para este e-mail. Revogue-o para gerar outro.", values };
    }
    if (pending) {
      await db.from("agency_invitations").update({ revoked_at: new Date().toISOString() }).eq("agency_id", ctx.agencyId).eq("id", pending.id);
    }

    const token = generateToken();
    const { error } = await db.from("agency_invitations").insert({
      agency_id: ctx.agencyId,
      email: parsed.data.email,
      role: parsed.data.role,
      token_hash: hashToken(token),
      invited_by: ctx.userId,
    });
    if (error) throw new Error(error.message);

    await db.rpc("mark_onboarding_step", { p_agency: ctx.agencyId, p_step: 2 });
    revalidatePath("/settings/team");
    revalidatePath("/dashboard");
    return {
      status: "success",
      message: "Convite criado. Copie o link e envie para a pessoa.",
      payload: { link: `${getAppUrl()}/invite/${token}`, email: parsed.data.email },
    };
  } catch (error) {
    return failure(error, values);
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const db = await createSupabaseServerClient();
    const { data, error } = await db
      .from("agency_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("agency_id", ctx.agencyId)
      .eq("id", z.uuid().parse(invitationId))
      .is("accepted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { status: "error", message: "Convite não encontrado." };
    revalidatePath("/settings/team");
    return { status: "success", message: "Convite revogado." };
  } catch (error) {
    return failure(error);
  }
}

export async function updateMemberAction(input: { memberId: string; role?: string; status?: string }): Promise<ActionState> {
  try {
    const ctx = await authorize();
    const parsed = memberUpdateSchema.parse(input);
    if (parsed.memberId === ctx.memberId) {
      return { status: "error", message: "Você não pode alterar o seu próprio acesso. Peça a outro dono." };
    }

    const db = await createSupabaseServerClient();
    const { data: member } = await db
      .from("agency_members")
      .select("id, role")
      .eq("agency_id", ctx.agencyId)
      .eq("id", parsed.memberId)
      .maybeSingle();
    if (!member) return { status: "error", message: "Membro não encontrado." };
    if (ctx.role !== "owner" && (member.role === "owner" || parsed.role === "owner")) {
      return { status: "error", message: "Apenas donos podem alterar ou conceder o perfil de dono." };
    }

    const update: { role?: AgencyRole; status?: "active" | "disabled" } = {};
    if (parsed.role) update.role = parsed.role;
    if (parsed.status) update.status = parsed.status;

    const { error } = await db.from("agency_members").update(update).eq("agency_id", ctx.agencyId).eq("id", member.id);
    if (error) {
      if (error.message.includes("at least one active owner")) {
        return { status: "error", message: "A agência precisa ter pelo menos um dono ativo." };
      }
      throw new Error(error.message);
    }
    revalidatePath("/settings/team");
    return { status: "success", message: parsed.status === "disabled" ? "Acesso desativado." : "Membro atualizado." };
  } catch (error) {
    return failure(error);
  }
}

export async function acceptInvitationAction(token: string): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  if (!isWellFormedToken(token)) return { status: "error", message: "Link de convite inválido." };

  const db = await createSupabaseServerClient();
  const { data: agencyId, error } = await db.rpc("accept_invitation", { p_token_hash: hashToken(token) });
  if (error || !agencyId) {
    const message =
      error?.message.includes("another e-mail")
        ? "Este convite foi enviado para outro e-mail. Entre com a conta do e-mail convidado."
        : "Este convite não é mais válido. Peça um novo link a quem convidou você.";
    return { status: "error", message };
  }

  (await cookies()).set(ACTIVE_AGENCY_COOKIE, agencyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/dashboard");
}
