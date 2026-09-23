"use client";

import { Loader2, Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { FormField, NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";

import { createQuoteAction } from "../actions";
import { QUOTE_CURRENCIES, QUOTE_CURRENCY_LABELS } from "../labels";

export type DealChoice = { id: string; title: string; customerName: string };

export function CreateQuoteForm({ deals, preselectedDealId }: { deals: DealChoice[]; preselectedDealId?: string }) {
  const [state, action, pending] = useActionState(createQuoteAction, initialActionState);
  const e = state.fieldErrors ?? {};
  const [dealId, setDealId] = useState(state.values?.deal_id ?? preselectedDealId ?? "");
  const deal = deals.find((d) => d.id === dealId);

  useEffect(() => {
    if (state.status === "error" && !state.fieldErrors) toast.error(state.message);
  }, [state]);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-6" noValidate>
      <FormField id="deal_id" label="Negócio (cliente e viagem)" required error={e.deal_id} className="sm:col-span-6">
        <NativeSelect id="deal_id" name="deal_id" value={dealId} onChange={(ev) => setDealId(ev.target.value)} aria-invalid={Boolean(e.deal_id)}>
          <option value="">Selecione…</option>
          {deals.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title.includes(d.customerName) ? d.title : `${d.title} · ${d.customerName}`}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField
        id="quote_title"
        label="Título da cotação"
        required
        error={e.title}
        hint="Aparece para a equipe; a proposta ao cliente terá seu próprio título."
        className="sm:col-span-4"
      >
        <Input
          id="quote_title"
          name="title"
          key={dealId}
          defaultValue={state.values?.title ?? (deal ? `Cotação · ${deal.title}` : "")}
          maxLength={120}
          aria-invalid={Boolean(e.title)}
        />
      </FormField>
      <FormField id="quote_currency" label="Moeda" error={e.currency} className="sm:col-span-2">
        <NativeSelect id="quote_currency" name="currency" defaultValue={state.values?.currency ?? "BRL"}>
          {QUOTE_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {QUOTE_CURRENCY_LABELS[c]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="flex justify-end sm:col-span-6">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          Criar cotação
        </Button>
      </div>
    </form>
  );
}
