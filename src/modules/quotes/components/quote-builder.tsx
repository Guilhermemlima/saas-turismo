"use client";

import { Archive, CheckCircle2, Copy, EyeOff, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField, NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { centsToInput, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { QuoteStatus } from "@/server/db/database.types";

import {
  addOptionAction,
  deleteItemAction,
  deleteOptionAction,
  duplicateOptionAction,
  setQuoteStatusAction,
  updateOptionAction,
  updateQuoteHeaderAction,
} from "../actions";
import { CURRENCIES } from "../schemas";
import { ItemEditor, ITEM_ICONS, type EditableItem } from "./item-editor";

export type BuilderItem = EditableItem & { price_cents: number; summary: string; dates: string | null };

export type BuilderOption = {
  id: string;
  title: string;
  description: string | null;
  service_fee_cents: number;
  discount_cents: number;
  items_price_cents: number;
  items_cost_cents: number;
  commission_cents: number;
  total_cents: number;
  margin_cents: number;
  items: BuilderItem[];
};

type Result = { status: string; message?: string };

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.status === "error") toast.error(result.message);
      else if (result.message) toast.success(result.message);
    });
  return { pending, run };
}

export function QuoteStatusActions({ quoteId, status }: { quoteId: string; status: QuoteStatus }) {
  const { pending, run } = useRun();
  if (status === "archived") {
    return (
      <Button variant="outline" disabled={pending} onClick={() => run(() => setQuoteStatusAction(quoteId, "draft"))}>
        <RotateCcw /> Restaurar
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" ? (
        <Button disabled={pending} onClick={() => run(() => setQuoteStatusAction(quoteId, "ready"))}>
          {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Marcar como pronta
        </Button>
      ) : (
        <Button variant="outline" disabled={pending} onClick={() => run(() => setQuoteStatusAction(quoteId, "draft"))}>
          <Pencil /> Reabrir para editar
        </Button>
      )}
      <Button variant="ghost" disabled={pending} onClick={() => run(() => setQuoteStatusAction(quoteId, "archived"))}>
        <Archive /> Arquivar
      </Button>
    </div>
  );
}

export function QuoteHeaderForm({ quoteId, title, currency, notes, editable }: { quoteId: string; title: string; currency: string; notes: string | null; editable: boolean }) {
  const [state, action, pending] = useActionState(updateQuoteHeaderAction.bind(null, quoteId), initialActionState);
  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error" && !state.fieldErrors) toast.error(state.message);
  }, [state]);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6" noValidate>
      <fieldset disabled={!editable || pending} className="contents">
        <FormField id="quote_title" label="Título" error={state.fieldErrors?.title} className="sm:col-span-4">
          <Input id="quote_title" name="title" defaultValue={state.values?.title ?? title} maxLength={160} />
        </FormField>
        <FormField id="quote_currency" label="Moeda" className="sm:col-span-2">
          <NativeSelect id="quote_currency" name="currency" defaultValue={state.values?.currency ?? currency}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="quote_notes" label="Notas internas" className="sm:col-span-6">
          <textarea
            id="quote_notes"
            name="internal_notes"
            defaultValue={state.values?.internal_notes ?? notes ?? ""}
            rows={2}
            maxLength={4000}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </FormField>
        {editable ? (
          <div className="flex justify-end sm:col-span-6">
            <Button type="submit" variant="outline" disabled={pending}>
              Salvar dados
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}

function OptionSettings({ option, currency, editable }: { option: BuilderOption; currency: string; editable: boolean }) {
  const [state, action, pending] = useActionState(updateOptionAction.bind(null, option.id), initialActionState);
  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.fieldErrors ? Object.values(state.fieldErrors)[0]?.[0] : state.message);
  }, [state]);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_140px_140px_auto] sm:items-end" noValidate>
      <fieldset disabled={!editable || pending} className="contents">
        <FormField id={`opt-title-${option.id}`} label="Nome da opção">
          <Input id={`opt-title-${option.id}`} name="title" defaultValue={option.title} maxLength={120} />
        </FormField>
        <FormField id={`opt-fee-${option.id}`} label={`Taxa de serviço (${currency})`}>
          <Input id={`opt-fee-${option.id}`} name="service_fee_cents" inputMode="decimal" defaultValue={centsToInput(option.service_fee_cents)} placeholder="0,00" />
        </FormField>
        <FormField id={`opt-discount-${option.id}`} label={`Desconto (${currency})`}>
          <Input id={`opt-discount-${option.id}`} name="discount_cents" inputMode="decimal" defaultValue={centsToInput(option.discount_cents)} placeholder="0,00" />
        </FormField>
        <input type="hidden" name="description" value={option.description ?? ""} />
        {editable ? (
          <Button type="submit" variant="outline" disabled={pending}>
            Salvar
          </Button>
        ) : null}
      </fieldset>
    </form>
  );
}

function Totals({ option, currency, showMargin }: { option: BuilderOption; currency: string; showMargin: boolean }) {
  const f = (c: number) => formatMoney(c, currency);
  const grossProfit = option.margin_cents + option.commission_cents;
  const marginRate = option.total_cents > 0 ? (option.margin_cents / option.total_cents) * 100 : null;
  return (
    <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
      <dl className="grid gap-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal dos itens</dt><dd className="tabular-nums">{f(option.items_price_cents)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Taxa de serviço</dt><dd className="tabular-nums">{f(option.service_fee_cents)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Desconto</dt><dd className="tabular-nums">− {f(option.discount_cents)}</dd></div>
        <div className="flex justify-between border-t pt-1.5 text-base font-semibold"><dt>Total ao cliente</dt><dd className="tabular-nums">{f(option.total_cents)}</dd></div>
      </dl>
      {showMargin ? (
        <dl className="grid gap-1.5 rounded-lg bg-muted/60 p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><EyeOff className="size-3.5" /> Interno — nunca aparece para o cliente</p>
          <div className="flex justify-between"><dt className="text-muted-foreground">Custo com fornecedores</dt><dd className="tabular-nums">{f(option.items_cost_cents)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Margem</dt><dd className="tabular-nums">{f(option.margin_cents)}{marginRate !== null ? ` (${marginRate.toFixed(1)}%)` : ""}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Comissões a receber</dt><dd className="tabular-nums">{f(option.commission_cents)}</dd></div>
          <div className="flex justify-between border-t pt-1.5 font-semibold"><dt>Lucro bruto</dt><dd className={cn("tabular-nums", grossProfit < 0 && "text-destructive")}>{f(grossProfit)}</dd></div>
        </dl>
      ) : null}
    </div>
  );
}

function OptionCard({ option, index, currency, editable, showMargin, canDelete }: { option: BuilderOption; index: number; currency: string; editable: boolean; showMargin: boolean; canDelete: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { pending, run } = useRun();
  const done = useCallback(() => setEditing(null), []);

  return (
    <section className="grid gap-4 rounded-xl border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          <span className="mr-2 rounded-md bg-accent px-2 py-0.5 text-sm text-accent-foreground">{index + 1}</span>
          {option.title}
        </h2>
        {editable ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => duplicateOptionAction(option.id))}>
              <Copy /> Duplicar
            </Button>
            {canDelete ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => deleteOptionAction(option.id))}>
                <Trash2 /> Remover
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <OptionSettings option={option} currency={currency} editable={editable} />

      {option.items.length === 0 && editing !== "new" ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nenhum item nesta opção ainda.</p>
      ) : null}

      <ul className="grid gap-2">
        {option.items.map((item) => {
          const Icon = ITEM_ICONS[item.item_type];
          if (editing === item.id) {
            return (
              <li key={item.id}>
                <ItemEditor optionId={option.id} item={item} currency={currency} showMargin={showMargin} onDone={done} />
              </li>
            );
          }
          return (
            <li key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {item.title}
                  {!item.show_price_to_customer ? <span className="ml-2 text-xs font-normal text-muted-foreground">(preço oculto na proposta)</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">{[item.summary, item.dates, item.supplier_name].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              <div className="text-right text-sm">
                <p className="font-medium tabular-nums">{formatMoney(item.price_cents, currency)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {item.quantity} × {formatMoney(item.price_cents / item.quantity, currency)}
                </p>
                {showMargin ? (
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    custo {formatMoney(item.quantity * item.unit_cost_cents, currency)} · markup {formatMoney(item.quantity * item.unit_markup_cents, currency)}
                  </p>
                ) : null}
              </div>
              {editable ? (
                <div className="flex shrink-0 flex-col gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Editar item" onClick={() => setEditing(item.id)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Remover item" disabled={pending} onClick={() => run(() => deleteItemAction(item.id))}>
                    <Trash2 />
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {editable ? (
        editing === "new" ? (
          <ItemEditor optionId={option.id} currency={currency} showMargin={showMargin} onDone={done} />
        ) : (
          <Button variant="outline" className="w-fit" onClick={() => setEditing("new")}>
            <Plus /> Adicionar item
          </Button>
        )
      ) : null}

      <Totals option={option} currency={currency} showMargin={showMargin} />
    </section>
  );
}

export function QuoteOptions({ quoteId, options, currency, editable, showMargin }: { quoteId: string; options: BuilderOption[]; currency: string; editable: boolean; showMargin: boolean }) {
  const { pending, run } = useRun();
  return (
    <div className="grid gap-4">
      {options.map((option, i) => (
        <OptionCard key={option.id} option={option} index={i} currency={currency} editable={editable} showMargin={showMargin} canDelete={options.length > 1} />
      ))}
      {editable && options.length < 6 ? (
        <Button variant="outline" className="w-fit" disabled={pending} onClick={() => run(() => addOptionAction(quoteId))}>
          <Plus /> Nova opção
        </Button>
      ) : null}
    </div>
  );
}
