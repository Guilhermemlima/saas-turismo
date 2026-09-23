"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { formValues, validationError, type ActionState } from "@/lib/action-state";
import { ACTIVE_AGENCY_COOKIE, getCurrentUser, getMemberships } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

import { agencyCreateSchema } from "./schemas";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export async function createAgencyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = agencyCreateSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, values);

  const supabase = await createSupabaseServerClient();
  const { data: agencyId, error } = await supabase.rpc("create_agency_with_owner", {
    p_name: parsed.data.name,
    p_phone_e164: parsed.data.phone_e164,
    p_email: parsed.data.email,
    p_city: parsed.data.city,
    p_state: parsed.data.state,
  });

  if (error || !agencyId) {
    const message =
      error?.message === "agency limit reached"
        ? "Você atingiu o limite de agências por conta."
        : "Não foi possível criar a agência. Tente novamente.";
    if (error) console.error("[agencies] create failed", error.message);
    return { status: "error", message, values };
  }

  (await cookies()).set(ACTIVE_AGENCY_COOKIE, agencyId, COOKIE_OPTIONS);
  redirect("/dashboard");
}

export async function switchAgencyAction(agencyId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = z.uuid().parse(agencyId);
  // Only accept agencies the user actually belongs to.
  const memberships = await getMemberships(user.id);
  if (!memberships.some((m) => m.agencyId === id)) redirect("/dashboard");

  (await cookies()).set(ACTIVE_AGENCY_COOKIE, id, COOKIE_OPTIONS);
  redirect("/dashboard");
}
