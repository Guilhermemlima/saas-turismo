"use client";

import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField, NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { BRAZIL_STATES } from "@/lib/brazil";
import { formatCnpj } from "@/lib/cnpj";
import { formatPhone } from "@/lib/phone";
import { TRIP_SCOPES, TRIP_TYPE_LABELS, TRIP_TYPES } from "@/modules/travel-requests/labels";
import type { TripScope } from "@/server/db/database.types";

import { removeLogoAction, updateAgencyProfileAction, updateSpecialtiesAction, uploadLogoAction } from "../settings-actions";

const SCOPE_CHIP_LABELS: Record<TripScope, string> = { national: "Viagens nacionais", international: "Viagens internacionais" };

function useResultToast(state: ActionState) {
  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
    if (state.status === "error" && state.message && !state.fieldErrors) toast.error(state.message);
  }, [state]);
}

export type AgencyProfileDefaults = {
  name: string;
  cnpj: string | null;
  phone_e164: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  city: string | null;
  state: string | null;
};

export function AgencyProfileForm({ defaults, readOnly }: { defaults: AgencyProfileDefaults; readOnly: boolean }) {
  const [state, action, pending] = useActionState(updateAgencyProfileAction, initialActionState);
  useResultToast(state);
  const e = state.fieldErrors ?? {};
  const v = (key: keyof AgencyProfileDefaults, stored: string) => state.values?.[key] ?? stored;

  return (
    <form action={action} key={state.values ? JSON.stringify(state.values) : "initial"} className="grid gap-5" noValidate>
      <fieldset disabled={readOnly || pending} className="grid gap-4 sm:grid-cols-6">
        <FormField id="name" label="Nome da agência" required error={e.name} className="sm:col-span-4">
          <Input id="name" name="name" defaultValue={v("name", defaults.name)} maxLength={120} />
        </FormField>
        <FormField id="cnpj" label="CNPJ" error={e.cnpj} hint="Opcional" className="sm:col-span-2">
          <Input id="cnpj" name="cnpj" inputMode="numeric" defaultValue={v("cnpj", formatCnpj(defaults.cnpj))} placeholder="00.000.000/0000-00" />
        </FormField>
        <FormField id="phone_e164" label="Telefone" error={e.phone_e164} className="sm:col-span-3">
          <Input id="phone_e164" name="phone_e164" type="tel" defaultValue={v("phone_e164", formatPhone(defaults.phone_e164))} />
        </FormField>
        <FormField id="email" label="E-mail comercial" error={e.email} className="sm:col-span-3">
          <Input id="email" name="email" type="email" defaultValue={v("email", defaults.email ?? "")} />
        </FormField>
        <FormField id="website" label="Site" error={e.website} className="sm:col-span-3">
          <Input id="website" name="website" defaultValue={v("website", defaults.website ?? "")} placeholder="www.suaagencia.com.br" />
        </FormField>
        <FormField id="instagram" label="Instagram" error={e.instagram} className="sm:col-span-3">
          <Input id="instagram" name="instagram" defaultValue={v("instagram", defaults.instagram ? `@${defaults.instagram}` : "")} placeholder="@suaagencia" />
        </FormField>
        <FormField id="city" label="Cidade" error={e.city} className="sm:col-span-4">
          <Input id="city" name="city" defaultValue={v("city", defaults.city ?? "")} maxLength={120} />
        </FormField>
        <FormField id="state" label="UF" error={e.state} className="sm:col-span-2">
          <NativeSelect id="state" name="state" defaultValue={v("state", defaults.state ?? "")}>
            <option value="">—</option>
            {BRAZIL_STATES.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </fieldset>
      {!readOnly ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Salvar dados
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function LogoUploader({ logoUrl, readOnly }: { logoUrl: string | null; readOnly: boolean }) {
  const [state, action, uploading] = useActionState(uploadLogoAction, initialActionState);
  const [removing, startRemove] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  useResultToast(state);

  const shown = preview ?? logoUrl;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- object URLs and remote logos; no optimization needed
          <img src={shown} alt="Logo da agência" className="size-full object-contain p-2" />
        ) : (
          <ImageUp className="size-6 text-muted-foreground" />
        )}
      </div>
      {!readOnly ? (
        <div className="grid gap-2">
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="max-w-64 text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1 file:text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
            <Button type="submit" variant="outline" disabled={uploading}>
              {uploading ? <Loader2 className="animate-spin" /> : <ImageUp />}
              Enviar logo
            </Button>
            {logoUrl ? (
              <Button
                type="button"
                variant="ghost"
                disabled={removing}
                onClick={() =>
                  startRemove(async () => {
                    const result = await removeLogoAction();
                    if (result.status === "error") toast.error(result.message);
                    else toast.success(result.message);
                  })
                }
              >
                <Trash2 /> Remover
              </Button>
            ) : null}
          </form>
          <p className="text-xs text-muted-foreground">PNG, JPG ou WebP, até 1 MB. Aparece no painel e, depois, nas propostas.</p>
          {state.fieldErrors?.logo ? <p className="text-xs text-destructive">{state.fieldErrors.logo[0]}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Chip({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors select-none hover:bg-muted has-checked:border-primary/50 has-checked:bg-accent has-checked:text-accent-foreground has-disabled:cursor-default has-disabled:opacity-70">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="size-3.5 accent-primary" />
      {label}
    </label>
  );
}

export function SpecialtiesForm({ specialties, scopes, readOnly }: { specialties: string[]; scopes: string[]; readOnly: boolean }) {
  const [state, action, pending] = useActionState(updateSpecialtiesAction, initialActionState);
  useResultToast(state);

  return (
    <form action={action} className="grid gap-5">
      <fieldset disabled={readOnly || pending} className="grid gap-4">
        <div className="grid gap-2">
          <span className="text-sm font-medium">Abrangência</span>
          <div className="flex flex-wrap gap-2">
            {TRIP_SCOPES.map((s) => (
              <Chip key={s} name="specialty_scopes" value={s} label={SCOPE_CHIP_LABELS[s]} checked={scopes.includes(s)} />
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Especialidades</span>
          <div className="flex flex-wrap gap-2">
            {TRIP_TYPES.map((t) => (
              <Chip key={t} name="specialties" value={t} label={TRIP_TYPE_LABELS[t]} checked={specialties.includes(t)} />
            ))}
          </div>
        </div>
      </fieldset>
      {!readOnly ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Salvar especialidades
          </Button>
        </div>
      ) : null}
    </form>
  );
}
