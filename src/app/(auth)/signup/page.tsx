import type { Metadata } from "next";
import Link from "next/link";

import { safeNextPath } from "@/lib/routes";
import { SignUpForm } from "@/modules/auth/components/auth-forms";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage(props: PageProps<"/signup">) {
  const next = safeNextPath((await props.searchParams).next, "");
  return (
    <div className="grid gap-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold">Criar conta</h1>
        <p className="text-sm text-muted-foreground">Comece a configurar sua agência em poucos minutos.</p>
      </div>
      <SignUpForm next={next || undefined} />
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-foreground underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
