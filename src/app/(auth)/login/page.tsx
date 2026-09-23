import type { Metadata } from "next";
import Link from "next/link";

import { safeNextPath } from "@/lib/routes";
import { SignInForm } from "@/modules/auth/components/auth-forms";

export const metadata: Metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  link_invalido: "O link de confirmação é inválido ou expirou. Entre ou solicite um novo cadastro.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = safeNextPath(params.next, "");
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <div className="grid gap-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold">Entrar</h1>
        <p className="text-sm text-muted-foreground">Acesse o painel da sua agência.</p>
      </div>
      {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      <SignInForm next={next || undefined} />
      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
