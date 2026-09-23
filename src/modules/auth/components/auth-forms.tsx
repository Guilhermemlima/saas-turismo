"use client";

import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";

import { requestPasswordResetAction, signInAction, signUpAction, updatePasswordAction } from "../actions";

function FormMessage({ message, tone }: { message?: string; tone: "error" | "success" }) {
  if (!message) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground"
      }
    >
      {message}
    </p>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInAction, initialActionState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-4" noValidate key={JSON.stringify(state.values ?? {})}>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormField id="email" label="E-mail" error={errors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required autoFocus />
      </FormField>
      <FormField id="password" label="Senha" error={errors.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </FormField>
      <Link href="/forgot-password" className="-mt-2 justify-self-end text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        Esqueci minha senha
      </Link>
      {state.status === "error" && !state.fieldErrors ? <FormMessage tone="error" message={state.message} /> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Entrar
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, initialActionState);
  const errors = state.fieldErrors ?? {};

  if (state.status === "success") {
    return (
      <div className="grid gap-3 rounded-xl border p-6 text-center">
        <MailCheck className="mx-auto size-8 text-primary" />
        <p className="font-medium">Verifique seu e-mail</p>
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4" noValidate key={JSON.stringify(state.values ?? {})}>
      <FormField id="full_name" label="Seu nome" error={errors.full_name}>
        <Input id="full_name" name="full_name" autoComplete="name" defaultValue={state.values?.full_name} required autoFocus />
      </FormField>
      <FormField id="email" label="E-mail de trabalho" error={errors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required />
      </FormField>
      <FormField id="password" label="Senha" error={errors.password} hint="Mínimo de 10 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </FormField>
      {state.status === "error" && !state.fieldErrors ? <FormMessage tone="error" message={state.message} /> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Criar conta
      </Button>
    </form>
  );
}

function SentNotice({ title, message }: { title: string; message?: string }) {
  return (
    <div className="grid gap-3 rounded-xl border p-6 text-center">
      <MailCheck className="mx-auto size-8 text-primary" />
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initialActionState);
  const errors = state.fieldErrors ?? {};

  if (state.status === "success") return <SentNotice title="Verifique seu e-mail" message={state.message} />;

  return (
    <form action={action} className="grid gap-4" noValidate key={JSON.stringify(state.values ?? {})}>
      <FormField id="email" label="E-mail da conta" error={errors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required autoFocus />
      </FormField>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Enviar link
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, initialActionState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormField id="password" label="Nova senha" error={errors.password} hint="Mínimo de 10 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus />
      </FormField>
      <FormField id="password_confirm" label="Repita a nova senha" error={errors.password_confirm}>
        <Input id="password_confirm" name="password_confirm" type="password" autoComplete="new-password" required />
      </FormField>
      {state.status === "error" && !state.fieldErrors ? <FormMessage tone="error" message={state.message} /> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Salvar nova senha
      </Button>
    </form>
  );
}
