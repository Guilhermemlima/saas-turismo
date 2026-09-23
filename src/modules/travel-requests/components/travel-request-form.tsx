"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { FormField, NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { centsToInput } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import type { DateFlexibility } from "@/server/db/database.types";

import {
  BUDGET_SCOPE_LABELS,
  BUDGET_SCOPES,
  DATE_FLEXIBILITIES,
  DATE_FLEXIBILITY_LABELS,
  MEAL_PLAN_LABELS,
  MEAL_PLANS,
  SERVICES,
  TRIP_SCOPE_LABELS,
  TRIP_SCOPES,
  TRIP_TYPE_LABELS,
  TRIP_TYPES,
} from "../labels";

export type TravelRequestFormDefaults = {
  customer_id?: string;
  assigned_member_id?: string | null;
  destination?: string | null;
  origin_city?: string | null;
  trip_scope?: string | null;
  trip_types?: string[];
  date_flexibility?: DateFlexibility;
  departure_date?: string | null;
  return_date?: string | null;
  travel_month?: string | null;
  adults?: number | null;
  children_ages?: number[];
  infants?: number;
  budget_cents?: number | null;
  budget_scope?: string | null;
  needs_flights?: boolean;
  needs_hotel?: boolean;
  needs_transfer?: boolean;
  needs_insurance?: boolean;
  needs_tours?: boolean;
  hotel_category?: number | null;
  rooms?: number | null;
  meal_plan?: string | null;
  special_requests?: string | null;
  notes?: string | null;
};

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: TravelRequestFormDefaults;
  members: { id: string; name: string }[];
  /** Only for creation: the traveler picker. */
  customers?: { id: string; full_name: string; phone_e164: string | null }[];
  submitLabel: string;
  readOnly?: boolean;
};

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t pt-5 first:border-t-0 first:pt-0 sm:grid-cols-[180px_1fr] sm:gap-6">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-6">{children}</div>
    </section>
  );
}

function ToggleChip({ name, value, label, defaultChecked }: { name: string; value?: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors select-none hover:bg-muted has-checked:border-primary/50 has-checked:bg-accent has-checked:text-accent-foreground has-disabled:cursor-default has-disabled:opacity-70">
      <input type="checkbox" name={name} value={value ?? "on"} defaultChecked={defaultChecked} className="size-3.5 accent-primary" />
      {label}
    </label>
  );
}

export function TravelRequestForm({ action, defaults = {}, members, customers, submitLabel, readOnly = false }: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [flexibility, setFlexibility] = useState<DateFlexibility>(
    (state.values?.date_flexibility as DateFlexibility | undefined) ?? defaults.date_flexibility ?? "undecided",
  );

  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
    if (state.status === "error" && state.message && !state.fieldErrors) toast.error(state.message);
  }, [state]);

  const errors = state.fieldErrors ?? {};
  const echoed = state.values;
  // Hidden inputs are disabled so they are not submitted (switching to "undecided" clears the dates).
  const usesDates = flexibility === "exact" || flexibility === "flexible_days";
  const usesMonth = flexibility === "month_only";
  const text = (key: keyof TravelRequestFormDefaults, stored: string | number | null | undefined) =>
    echoed?.[key] ?? (stored == null ? "" : String(stored));
  const checked = (key: keyof TravelRequestFormDefaults) => (echoed ? echoed[key] === "on" : Boolean(defaults[key]));
  const tripTypes = echoed ? (echoed.trip_types ?? "").split(",").filter(Boolean) : (defaults.trip_types ?? []);
  const invalid = (key: string) => (errors[key]?.length ? true : undefined);
  const formKey = echoed ? JSON.stringify(echoed) : "initial";

  return (
    <form action={formAction} key={formKey} className="grid gap-6" noValidate>
      <fieldset disabled={readOnly || pending} className="grid gap-6">
        <Section title="Viajante" description="Cliente titular e consultor responsável.">
          {customers ? (
            <FormField id="customer_id" label="Cliente" required error={errors.customer_id} className="sm:col-span-4">
              <NativeSelect id="customer_id" name="customer_id" defaultValue={text("customer_id", defaults.customer_id)} aria-invalid={invalid("customer_id")}>
                <option value="">Selecione…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {c.phone_e164 ? ` · ${formatPhone(c.phone_e164)}` : ""}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : null}
          <FormField id="assigned_member_id" label="Consultor" error={errors.assigned_member_id} className={customers ? "sm:col-span-2" : "sm:col-span-3"}>
            <NativeSelect id="assigned_member_id" name="assigned_member_id" defaultValue={text("assigned_member_id", defaults.assigned_member_id)}>
              <option value="">Sem responsável</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </Section>

        <Section title="Destino" description="Para onde e de onde.">
          <FormField id="destination" label="Destino" error={errors.destination} className="sm:col-span-4">
            <Input id="destination" name="destination" defaultValue={text("destination", defaults.destination)} placeholder="Ex.: Maceió, Paris, Disney Orlando" maxLength={160} aria-invalid={invalid("destination")} />
          </FormField>
          <FormField id="trip_scope" label="Tipo de destino" error={errors.trip_scope} className="sm:col-span-2">
            <NativeSelect id="trip_scope" name="trip_scope" defaultValue={text("trip_scope", defaults.trip_scope)}>
              <option value="">—</option>
              {TRIP_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {TRIP_SCOPE_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="origin_city" label="Cidade de origem" error={errors.origin_city} className="sm:col-span-3">
            <Input id="origin_city" name="origin_city" defaultValue={text("origin_city", defaults.origin_city)} placeholder="Ex.: Recife" maxLength={120} />
          </FormField>
          <div className="grid gap-1.5 sm:col-span-6">
            <span className="text-sm font-medium">Perfil da viagem</span>
            <div className="flex flex-wrap gap-2">
              {TRIP_TYPES.map((type) => (
                <ToggleChip key={type} name="trip_types" value={type} label={TRIP_TYPE_LABELS[type]} defaultChecked={tripTypes.includes(type)} />
              ))}
            </div>
            {errors.trip_types ? <p className="text-xs text-destructive">{errors.trip_types[0]}</p> : null}
          </div>
        </Section>

        <Section title="Datas" description="Tão precisas quanto o cliente souber.">
          <FormField id="date_flexibility" label="Situação das datas" error={errors.date_flexibility} className="sm:col-span-6">
            <NativeSelect
              id="date_flexibility"
              name="date_flexibility"
              value={flexibility}
              onChange={(e) => setFlexibility(e.target.value as DateFlexibility)}
            >
              {DATE_FLEXIBILITIES.map((f) => (
                <option key={f} value={f}>
                  {DATE_FLEXIBILITY_LABELS[f]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <div className={cn("contents", !usesDates && "hidden")}>
            <FormField id="departure_date" label="Ida" error={errors.departure_date} className="sm:col-span-3">
              <Input id="departure_date" name="departure_date" type="date" disabled={!usesDates} defaultValue={text("departure_date", defaults.departure_date)} aria-invalid={invalid("departure_date")} />
            </FormField>
            <FormField id="return_date" label="Volta" error={errors.return_date} className="sm:col-span-3">
              <Input id="return_date" name="return_date" type="date" disabled={!usesDates} defaultValue={text("return_date", defaults.return_date)} aria-invalid={invalid("return_date")} />
            </FormField>
          </div>
          <div className={cn("contents", !usesMonth && "hidden")}>
            <FormField id="travel_month" label="Mês da viagem" error={errors.travel_month} className="sm:col-span-3">
              <Input
                id="travel_month"
                name="travel_month"
                type="month"
                disabled={!usesMonth}
                defaultValue={echoed?.travel_month ?? defaults.travel_month?.slice(0, 7) ?? ""}
                aria-invalid={invalid("travel_month")}
              />
            </FormField>
          </div>
        </Section>

        <Section title="Passageiros" description="Composição do grupo. Os nomes entram na reserva.">
          <FormField id="adults" label="Adultos" error={errors.adults} className="sm:col-span-2">
            <Input id="adults" name="adults" type="number" min={1} max={99} inputMode="numeric" defaultValue={text("adults", defaults.adults)} aria-invalid={invalid("adults")} />
          </FormField>
          <FormField id="children_ages" label="Idades das crianças" error={errors.children_ages} hint="Ex.: 4, 9" className="sm:col-span-2">
            <Input id="children_ages" name="children_ages" defaultValue={echoed?.children_ages ?? (defaults.children_ages ?? []).join(", ")} placeholder="Nenhuma" aria-invalid={invalid("children_ages")} />
          </FormField>
          <FormField id="infants" label="Bebês (0–2)" error={errors.infants} className="sm:col-span-2">
            <Input id="infants" name="infants" type="number" min={0} max={20} inputMode="numeric" defaultValue={text("infants", defaults.infants || null)} aria-invalid={invalid("infants")} />
          </FormField>
        </Section>

        <Section title="Serviços e orçamento">
          <div className="flex flex-wrap gap-2 sm:col-span-6">
            {SERVICES.map((service) => (
              <ToggleChip key={service.key} name={service.key} label={service.label} defaultChecked={checked(service.key)} />
            ))}
          </div>
          <FormField id="budget_cents" label="Orçamento (R$)" error={errors.budget_cents} className="sm:col-span-3">
            <Input id="budget_cents" name="budget_cents" inputMode="decimal" defaultValue={echoed?.budget_cents ?? centsToInput(defaults.budget_cents)} placeholder="Ex.: 8.000" aria-invalid={invalid("budget_cents")} />
          </FormField>
          <FormField id="budget_scope" label="Referência" error={errors.budget_scope} className="sm:col-span-3">
            <NativeSelect id="budget_scope" name="budget_scope" defaultValue={text("budget_scope", defaults.budget_scope ?? "total")}>
              {BUDGET_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {BUDGET_SCOPE_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </Section>

        <Section title="Hospedagem" description="Se o cliente precisar de hotel.">
          <FormField id="hotel_category" label="Categoria" error={errors.hotel_category} className="sm:col-span-2">
            <NativeSelect id="hotel_category" name="hotel_category" defaultValue={text("hotel_category", defaults.hotel_category)}>
              <option value="">—</option>
              {[5, 4, 3, 2, 1].map((stars) => (
                <option key={stars} value={stars}>
                  {stars} estrela{stars > 1 ? "s" : ""}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="rooms" label="Quartos" error={errors.rooms} className="sm:col-span-2">
            <Input id="rooms" name="rooms" type="number" min={1} max={50} inputMode="numeric" defaultValue={text("rooms", defaults.rooms)} aria-invalid={invalid("rooms")} />
          </FormField>
          <FormField id="meal_plan" label="Regime" error={errors.meal_plan} className="sm:col-span-2">
            <NativeSelect id="meal_plan" name="meal_plan" defaultValue={text("meal_plan", defaults.meal_plan)}>
              <option value="">—</option>
              {MEAL_PLANS.map((m) => (
                <option key={m} value={m}>
                  {MEAL_PLAN_LABELS[m]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </Section>

        <Section title="Observações">
          <FormField id="special_requests" label="Pedidos especiais do cliente" error={errors.special_requests} className="sm:col-span-6">
            <Textarea id="special_requests" name="special_requests" rows={3} maxLength={2000} defaultValue={text("special_requests", defaults.special_requests)} placeholder="Ex.: quarto com vista para o mar, voo direto, berço" />
          </FormField>
          <FormField id="notes" label="Notas internas" error={errors.notes} hint="Não aparecem para o cliente." className="sm:col-span-6">
            <Textarea id="notes" name="notes" rows={3} maxLength={4000} defaultValue={text("notes", defaults.notes)} />
          </FormField>
        </Section>
      </fieldset>

      {state.status === "error" && state.message && state.fieldErrors ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}

      {!readOnly ? (
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {submitLabel}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
