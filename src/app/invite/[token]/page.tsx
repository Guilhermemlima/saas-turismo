import { MailWarning, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/permissions";
import { AcceptInvitationButton } from "@/modules/members/components/accept-invitation-button";
import { getCurrentUser } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { hashToken, isWellFormedToken } from "@/server/security/tokens";

export const metadata: Metadata = { title: "Convite", referrer: "no-referrer" };

const STATUS_MESSAGES = {
  accepted: "Este convite já foi usado.",
  expired: "Este convite expirou. Peça um novo link a quem convidou você.",
  revoked: "Este convite foi cancelado pela agência.",
} as const;

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  const invitation = isWellFormedToken(token)
    ? (await (await createSupabaseServerClient()).rpc("get_invitation", { p_token_hash: hashToken(token) })).data?.[0]
    : undefined;

  const wrongAccount = invitation && user.email?.toLowerCase() !== invitation.email;

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {!invitation ? (
          <CardHeader className="text-center">
            <MailWarning className="mx-auto mb-2 size-8 text-muted-foreground" />
            <CardTitle>Convite não encontrado</CardTitle>
            <CardDescription>O link está incompleto ou não existe. Confira se copiou o endereço inteiro.</CardDescription>
          </CardHeader>
        ) : invitation.status !== "pending" ? (
          <CardHeader className="text-center">
            <MailWarning className="mx-auto mb-2 size-8 text-muted-foreground" />
            <CardTitle>{invitation.agency_name}</CardTitle>
            <CardDescription>{STATUS_MESSAGES[invitation.status]}</CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <UsersRound className="size-6" />
              </div>
              <CardTitle className="text-xl">Entrar na equipe da {invitation.agency_name}</CardTitle>
              <CardDescription>
                Você foi convidado como <strong className="text-foreground">{ROLE_LABELS[invitation.role]}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {wrongAccount ? (
                <p className="rounded-lg bg-warm/15 px-3 py-2 text-sm text-warm-foreground">
                  Este convite é para <strong>{invitation.email}</strong>, mas você entrou como {user.email}. Saia e entre
                  com o e-mail convidado.
                </p>
              ) : (
                <AcceptInvitationButton token={token} />
              )}
            </CardContent>
          </>
        )}
        <CardContent className="pt-0 text-center">
          <Link href="/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Ir para o painel
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
