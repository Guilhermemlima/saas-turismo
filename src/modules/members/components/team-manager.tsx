"use client";

import { Check, Copy, Loader2, MessageCircle, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField, NativeSelect } from "@/components/shared/form-field";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";
import type { AgencyRole, MemberStatus } from "@/server/db/database.types";

import { createInvitationAction, revokeInvitationAction, updateMemberAction } from "../actions";

const ROLE_ORDER: AgencyRole[] = ["consultant", "attendant", "financial", "manager", "owner"];

export type TeamRow = { id: string; name: string; email: string | null; role: AgencyRole; status: MemberStatus; isSelf: boolean };
export type InviteRow = { id: string; email: string; role: AgencyRole; expiresAt: string };

export function InviteForm({ canInviteOwner }: { canInviteOwner: boolean }) {
  const [state, action, pending] = useActionState(createInvitationAction, initialActionState);
  const [copied, setCopied] = useState(false);
  const roles = ROLE_ORDER.filter((r) => canInviteOwner || r !== "owner");
  const link = state.status === "success" ? state.payload?.link : undefined;

  useEffect(() => {
    if (state.status === "error" && !state.fieldErrors) toast.error(state.message);
  }, [state]);

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copiado.");
  }

  const whatsapp = link
    ? `https://wa.me/?text=${encodeURIComponent(`Oi! Este é o seu convite para entrar na equipe da agência: ${link}`)}`
    : undefined;

  return (
    <div className="grid gap-4">
      <form action={action} key={link ?? "form"} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end" noValidate>
        <FormField id="invite_email" label="E-mail da pessoa" error={state.fieldErrors?.email}>
          <Input id="invite_email" name="email" type="email" defaultValue={link ? "" : state.values?.email} placeholder="nome@agencia.com.br" required />
        </FormField>
        <FormField id="invite_role" label="Perfil" error={state.fieldErrors?.role}>
          <NativeSelect id="invite_role" name="role" defaultValue={state.values?.role ?? "consultant"}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Gerar convite
        </Button>
      </form>

      {link ? (
        <div className="grid gap-3 rounded-lg border border-success/40 bg-success/5 p-4">
          <p className="text-sm">
            Convite criado para <strong>{state.payload?.email}</strong>. Envie o link abaixo; ele vale por 7 dias, funciona uma única
            vez e só para esse e-mail. <strong>Ele não será mostrado novamente.</strong>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" aria-label="Link do convite" />
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
              <MessageCircle /> WhatsApp
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MembersList({ members, viewerIsOwner }: { members: TeamRow[]; viewerIsOwner: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (input: { memberId: string; role?: string; status?: string }) =>
    startTransition(async () => {
      const result = await updateMemberAction(input);
      if (result.status === "error") {
        toast.error(result.message);
        router.refresh(); // restore the persisted values in the selects
      } else toast.success(result.message);
    });

  return (
    <ul className="divide-y rounded-lg border">
      {members.map((m) => {
        const locked = m.isSelf || (!viewerIsOwner && m.role === "owner");
        return (
          <li key={m.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate font-medium">
                {m.name}
                {m.isSelf ? <span className="text-xs font-normal text-muted-foreground">(você)</span> : null}
                {m.status === "disabled" ? <Badge variant="outline">Desativado</Badge> : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{m.email ?? "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <NativeSelect
                key={`${m.id}-${m.role}`}
                aria-label={`Perfil de ${m.name}`}
                defaultValue={m.role}
                disabled={locked || pending || m.status === "disabled"}
                onChange={(e) => run({ memberId: m.id, role: e.target.value })}
                className="w-48"
              >
                {ROLE_ORDER.filter((r) => viewerIsOwner || r !== "owner" || m.role === "owner").map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
              {!locked ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => run({ memberId: m.id, status: m.status === "active" ? "disabled" : "active" })}
                >
                  {m.status === "active" ? "Desativar" : "Reativar"}
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PendingInvites({ invites }: { invites: InviteRow[] }) {
  const [pending, startTransition] = useTransition();
  if (invites.length === 0) return <p className="text-sm text-muted-foreground">Nenhum convite pendente.</p>;

  return (
    <ul className="divide-y rounded-lg border">
      {invites.map((i) => {
        const expired = new Date(i.expiresAt) < new Date();
        return (
          <li key={i.id} className="flex items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{i.email}</p>
              <p className="text-xs text-muted-foreground">
                {ROLE_LABELS[i.role]} · {expired ? "expirado" : `expira em ${formatDate(i.expiresAt)}`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await revokeInvitationAction(i.id);
                  if (result.status === "error") toast.error(result.message);
                  else toast.success(result.message);
                })
              }
            >
              <X /> Revogar
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
