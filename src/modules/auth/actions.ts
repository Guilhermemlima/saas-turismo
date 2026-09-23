"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { formValues, validationError, type ActionState } from "@/lib/action-state";
import { requirePublicEnv } from "@/lib/env";
import { requiredText } from "@/lib/form-fields";
import { safeNextPath } from "@/lib/routes";
import { createSupabaseServerClient } from "@/server/db/server-client";

const email = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : ""),
  z.email("E-mail inválido."),
);

const signInSchema = z.object({
  email,
  password: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().min(1, "Informe a senha.")),
});

const signUpSchema = z.object({
  full_name: requiredText(2, 120, "Nome"),
  email,
  password: z.preprocess(
    (v) => (typeof v === "string" ? v : ""),
    z.string().min(10, "A senha deve ter ao menos 10 caracteres.").max(72, "Senha longa demais."),
  ),
});

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, { email: values.email ?? "" });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Generic message: never reveal whether the e-mail exists.
    const message =
      error.code === "email_not_confirmed"
        ? "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada."
        : "E-mail ou senha incorretos.";
    return { status: "error", message, values: { email: parsed.data.email } };
  }

  redirect(safeNextPath(values.next));
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = signUpSchema.safeParse(values);
  const safeValues = { full_name: values.full_name ?? "", email: values.email ?? "" };
  if (!parsed.success) return validationError(parsed.error, safeValues);

  const { NEXT_PUBLIC_APP_URL } = requirePublicEnv();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
    },
  });

  if (error) {
    const message =
      error.code === "weak_password"
        ? "Senha fraca ou já exposta em vazamentos. Escolha outra."
        : "Não foi possível criar a conta. Tente novamente.";
    return { status: "error", message, values: safeValues };
  }

  // With e-mail confirmation enabled there is no session yet.
  if (!data.session) {
    return {
      status: "success",
      message: "Conta criada! Enviamos um link de confirmação para o seu e-mail.",
    };
  }
  redirect("/onboarding");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
