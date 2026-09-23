"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { FormField, NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { BRAZIL_STATES } from "@/lib/brazil";

import { createAgencyAction } from "../actions";

export function CreateAgencyForm() {
  const [state, action, pending] = useActionState(createAgencyAction, initialActionState);
  const errors = state.fieldErrors ?? {};
  const v = state.values ?? {};

  return (
    <form action={action} className="grid gap-5 sm:grid-cols-6" noValidate key={JSON.stringify(v)}>
      <FormField id="name" label="Nome da agência" required error={errors.name} className="sm:col-span-6">
        <Input id="name" name="name" defaultValue={v.name} maxLength={120} required autoFocus aria-invalid={errors.name ? true : undefined} />
      </FormField>
      <FormField id="phone_e164" label="Telefone comercial" error={errors.phone_e164} className="sm:col-span-3">
        <Input id="phone_e164" name="phone_e164" type="tel" defaultValue={v.phone_e164} placeholder="(82) 3333-0000" maxLength={30} />
      </FormField>
      <FormField id="email" label="E-mail comercial" error={errors.email} className="sm:col-span-3">
        <Input id="email" name="email" type="email" defaultValue={v.email} maxLength={254} />
      </FormField>
      <FormField id="city" label="Cidade" error={errors.city} className="sm:col-span-4">
        <Input id="city" name="city" defaultValue={v.city} maxLength={120} />
      </FormField>
      <FormField id="state" label="UF" error={errors.state} className="sm:col-span-2">
        <NativeSelect id="state" name="state" defaultValue={v.state ?? ""}>
          <option value="">—</option>
          {BRAZIL_STATES.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-6">
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end sm:col-span-6">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Criar agência <ArrowRight />
        </Button>
      </div>
    </form>
  );
}
