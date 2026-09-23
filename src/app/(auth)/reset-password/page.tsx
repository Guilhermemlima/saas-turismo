import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/modules/auth/components/auth-forms";
import { getCurrentUser } from "@/server/auth/tenant";

export const metadata: Metadata = { title: "Nova senha" };

/** Reached from the recovery e-mail: /auth/callback exchanges the code and opens a session first. */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/forgot-password?error=sessao_expirada");

  return (
    <div className="grid gap-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold">Criar nova senha</h1>
        <p className="text-sm text-muted-foreground">Conta: {user.email}</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
