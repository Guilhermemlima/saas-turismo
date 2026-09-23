"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { FormField, NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { BRAZIL_STATES } from "@/lib/brazil";
import { formatPhone } from "@/lib/phone";

import { CUSTOMER_SOURCE_LABELS, CUSTOMER_SOURCES } from "../schemas";

export type CustomerFormDefaults = {
  full_name?: string;
  phone_e164?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  birth_date?: string | null;
  source?: string;
  owner_member_id?: string | null;
  notes?: string | null;
  marketing_opt_in?: boolean;
};

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: CustomerFormDefaults;
  members: { id: string; name: string }[];
  submitLabel: string;
  readOnly?: boolean;
};

export function CustomerForm({ action, defaults = {}, members, submitLabel, readOnly = false }: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);

  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
    if (state.status === "error" && state.message && !state.fieldErrors) toast.error(state.message);
  }, [state]);

  // After a failed submit keep what the user typed; otherwise show stored values.
  const value = (key: keyof CustomerFormDefaults, fallback = "") =>
    state.values?.[key] ?? (defaults[key] == null ? fallback : String(defaults[key]));
  const errors = state.fieldErrors ?? {};
  const invalid = (key: string) => (errors[key]?.length ? true : undefined);
  // Re-mount inputs when the server echoes values so defaultValue refreshes.
  const formKey = state.values ? JSON.stringify(state.values) : "initial";

  return (
    <form action={formAction} key={formKey} className="grid gap-6" noValidate>
      <fieldset disabled={readOnly || pending} className="grid gap-5 sm:grid-cols-6">
        <FormField id="full_name" label="Nome completo" required error={errors.full_name} className="sm:col-span-4">
          <Input id="full_name" name="full_name" defaultValue={value("full_name")} maxLength={120} autoComplete="off" aria-invalid={invalid("full_name")} required />
        </FormField>

        <FormField id="birth_date" label="Nascimento" error={errors.birth_date} className="sm:col-span-2">
          <Input id="birth_date" name="birth_date" type="date" defaultValue={value("birth_date")} aria-invalid={invalid("birth_date")} />
        </FormField>

        <FormField id="phone_e164" label="Telefone / WhatsApp" error={errors.phone_e164} hint="Com DDD. Telefone ou e-mail é obrigatório." className="sm:col-span-3">
          <Input
            id="phone_e164"
            name="phone_e164"
            type="tel"
            inputMode="tel"
            defaultValue={state.values?.phone_e164 ?? formatPhone(defaults.phone_e164)}
            placeholder="(82) 99999-0001"
            maxLength={30}
            aria-invalid={invalid("phone_e164")}
          />
        </FormField>

        <FormField id="email" label="E-mail" error={errors.email} className="sm:col-span-3">
          <Input id="email" name="email" type="email" defaultValue={value("email")} maxLength={254} aria-invalid={invalid("email")} />
        </FormField>

        <FormField id="city" label="Cidade" error={errors.city} className="sm:col-span-4">
          <Input id="city" name="city" defaultValue={value("city")} maxLength={120} aria-invalid={invalid("city")} />
        </FormField>

        <FormField id="state" label="UF" error={errors.state} className="sm:col-span-2">
          <NativeSelect id="state" name="state" defaultValue={value("state")} aria-invalid={invalid("state")}>
            <option value="">—</option>
            {BRAZIL_STATES.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        <FormField id="source" label="Origem do contato" error={errors.source} className="sm:col-span-3">
          <NativeSelect id="source" name="source" defaultValue={value("source", "manual")} aria-invalid={invalid("source")}>
            {CUSTOMER_SOURCES.map((source) => (
              <option key={source} value={source}>
                {CUSTOMER_SOURCE_LABELS[source]}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        <FormField id="owner_member_id" label="Consultor responsável" error={errors.owner_member_id} className="sm:col-span-3">
          <NativeSelect id="owner_member_id" name="owner_member_id" defaultValue={value("owner_member_id")} aria-invalid={invalid("owner_member_id")}>
            <option value="">Sem responsável</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        <FormField id="notes" label="Observações internas" error={errors.notes} className="sm:col-span-6">
          <Textarea id="notes" name="notes" defaultValue={value("notes")} maxLength={2000} rows={4} aria-invalid={invalid("notes")} />
        </FormField>

        <label className="flex items-start gap-2.5 text-sm sm:col-span-6">
          <input
            type="checkbox"
            name="marketing_opt_in"
            defaultChecked={state.values ? state.values.marketing_opt_in === "on" : Boolean(defaults.marketing_opt_in)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            Cliente autorizou receber ofertas e novidades
            <span className="block text-xs text-muted-foreground">Registro de consentimento para comunicações de marketing (LGPD).</span>
          </span>
        </label>
      </fieldset>

      {state.status === "error" && state.message && state.fieldErrors ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}

      {!readOnly ? (
        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {submitLabel}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
