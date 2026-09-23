import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/modules/auth/components/auth-forms";

export const metadata: Metadata = { title: "Recuperar senha" };

const ERRORS: Record<string, string> = {
  sessao_expirada: "O link de redefinição expirou. Solicite um novo abaixo.",
};

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  const { error } = await props.searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <div className="grid gap-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold">Recuperar senha</h1>
        <p className="text-sm text-muted-foreground">Enviaremos um link para você criar uma nova senha.</p>
      </div>
      {message ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p> : null}
      <ForgotPasswordForm />
      <p className="text-center text-sm text-muted-foreground">
        Lembrou?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
