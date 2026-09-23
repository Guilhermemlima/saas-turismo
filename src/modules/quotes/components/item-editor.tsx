"use client";

import { BedDouble, Bus, Loader2, Map as MapIcon, Package, Plane, ShieldCheck } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { FormField, NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { MEAL_PLAN_LABELS, MEAL_PLANS } from "@/modules/travel-requests/labels";
import type { QuoteItemType } from "@/server/db/database.types";

import { saveItemAction } from "../actions";
import { linePriceCents, markupForMarginPct } from "../pricing";
import { CABIN_LABELS, CABINS, QUOTE_ITEM_LABELS, QUOTE_ITEM_TYPES } from "../schemas";

export const ITEM_ICONS: Record<QuoteItemType, typeof Plane> = {
  flight: Plane,
  hotel: BedDouble,
  transfer: Bus,
  tour: MapIcon,
  insurance: ShieldCheck,
  other: Package,
};

export type EditableItem = {
  id: string;
  item_type: QuoteItemType;
  title: string;
  description: string | null;
  supplier_name: string | null;
  start_date: string | null;
  end_date: string | null;
  quantity: number;
  unit_cost_cents: number;
  unit_markup_cents: number;
  unit_fees_cents: number;
  commission_cents: number;
  show_price_to_customer: boolean;
  details: Record<string, string | number | undefined>;
};

type Field = { name: string; label: string; type?: "text" | "number" | "datetime-local" | "select"; options?: { value: string; label: string }[]; span?: 2 | 3 | 4 | 6; placeholder?: string };

const DETAIL_FIELDS: Record<QuoteItemType, Field[]> = {
  flight: [
    { name: "airline", label: "Companhia", placeholder: "LATAM, GOL, Azul…", span: 2 },
    { name: "flight_number", label: "Voo", placeholder: "LA 3456", span: 2 },
    { name: "cabin", label: "Classe", type: "select", options: CABINS.map((c) => ({ value: c, label: CABIN_LABELS[c] })), span: 2 },
    { name: "origin", label: "Origem", placeholder: "Recife (REC)", span: 3 },
    { name: "destination", label: "Destino", placeholder: "Maceió (MCZ)", span: 3 },
    { name: "departure_at", label: "Ida (partida)", type: "datetime-local", span: 3 },
    { name: "return_departure_at", label: "Volta (partida)", type: "datetime-local", span: 3 },
    { name: "stops", label: "Escalas", type: "number", span: 2 },
    { name: "baggage", label: "Bagagem", placeholder: "1 mala de 23 kg + mão", span: 4 },
  ],
  hotel: [
    { name: "hotel_name", label: "Hotel", placeholder: "Nome do hotel", span: 3 },
    { name: "category", label: "Estrelas", type: "number", span: 3 },
    { name: "room_type", label: "Quarto", placeholder: "Duplo vista mar", span: 3 },
    { name: "meal_plan", label: "Regime", type: "select", options: MEAL_PLANS.map((m) => ({ value: m, label: MEAL_PLAN_LABELS[m] })), span: 3 },
  ],
  transfer: [
    { name: "route", label: "Trajeto", placeholder: "Aeroporto ↔ hotel", span: 3 },
    { name: "vehicle", label: "Veículo", placeholder: "Privativo, van, compartilhado…", span: 3 },
  ],
  tour: [
    { name: "duration", label: "Duração", placeholder: "Dia inteiro", span: 3 },
    { name: "meeting_point", label: "Ponto de encontro", span: 3 },
  ],
  insurance: [
    { name: "plan", label: "Plano", placeholder: "Nome do plano", span: 3 },
    { name: "coverage", label: "Cobertura", placeholder: "USD 60 mil, bagagem…", span: 3 },
  ],
  other: [],
};

const DATE_LABELS: Record<QuoteItemType, [string, string]> = {
  flight: ["Data da ida", "Data da volta"],
  hotel: ["Check-in", "Check-out"],
  transfer: ["Data", "Data da volta"],
  tour: ["Data", "Até"],
  insurance: ["Início", "Fim"],
  other: ["Início", "Fim"],
};

const SPAN: Record<number, string> = { 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4", 6: "sm:col-span-6" };

export function ItemEditor({
  optionId,
  item,
  currency,
  showMargin,
  onDone,
}: {
  optionId: string;
  item?: EditableItem;
  currency: string;
  showMargin: boolean;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveItemAction.bind(null, optionId, item?.id ?? null), initialActionState);
  const [type, setType] = useState<QuoteItemType>(item?.item_type ?? "flight");
  const [money, setMoney] = useState({
    quantity: String(item?.quantity ?? 1),
    cost: centsToInput(item?.unit_cost_cents),
    markup: centsToInput(item?.unit_markup_cents),
    fees: centsToInput(item?.unit_fees_cents),
  });
  const [targetMargin, setTargetMargin] = useState("");

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      onDone();
    }
    if (state.status === "error" && !state.fieldErrors) toast.error(state.message);
  }, [state, onDone]);

  const cents = (v: string) => parseMoneyToCents(v) ?? 0;
  const qty = Math.max(1, Number(money.quantity) || 1);
  const price = linePriceCents({ quantity: qty, unitCostCents: cents(money.cost), unitMarkupCents: cents(money.markup), unitFeesCents: cents(money.fees) });
  const markupTotal = qty * cents(money.markup);
  const e = state.fieldErrors ?? {};
  const v = (name: string, stored: string | number | null | undefined) => state.values?.[name] ?? (stored == null ? "" : String(stored));
  const [startLabel, endLabel] = DATE_LABELS[type];

  function applyMargin() {
    const pct = Number(targetMargin.replace(",", "."));
    if (!pct) return;
    setMoney((m) => ({ ...m, markup: centsToInput(markupForMarginPct(cents(m.cost), cents(m.fees), pct)) }));
  }

  return (
    <form action={action} className="grid gap-4 rounded-lg border bg-muted/30 p-4" noValidate>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de item">
        {QUOTE_ITEM_TYPES.map((t) => {
          const Icon = ITEM_ICONS[t];
          return (
            <label
              key={t}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm transition-colors",
                type === t ? "border-primary/50 bg-accent text-accent-foreground" : "bg-background hover:bg-muted",
              )}
            >
              <input type="radio" name="item_type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
              <Icon className="size-3.5" /> {QUOTE_ITEM_LABELS[t]}
            </label>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-6">
        <FormField id={`title-${optionId}`} label="Título" hint="Em branco: gerado a partir dos detalhes." error={e.title} className="sm:col-span-4">
          <Input id={`title-${optionId}`} name="title" defaultValue={v("title", item?.title)} maxLength={160} />
        </FormField>
        <FormField id={`supplier-${optionId}`} label="Fornecedor" error={e.supplier_name} className="sm:col-span-2">
          <Input id={`supplier-${optionId}`} name="supplier_name" defaultValue={v("supplier_name", item?.supplier_name)} maxLength={120} placeholder="Operadora, consolidadora…" />
        </FormField>

        {DETAIL_FIELDS[type].map((f) => (
          <FormField key={`${type}-${f.name}`} id={`d_${f.name}-${optionId}`} label={f.label} error={e[`d_${f.name}`]} className={SPAN[f.span ?? 3] ?? "sm:col-span-3"}>
            {f.type === "select" ? (
              <NativeSelect id={`d_${f.name}-${optionId}`} name={`d_${f.name}`} defaultValue={v(`d_${f.name}`, item?.details[f.name])}>
                <option value="">—</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Input
                id={`d_${f.name}-${optionId}`}
                name={`d_${f.name}`}
                type={f.type ?? "text"}
                defaultValue={v(`d_${f.name}`, item?.details[f.name])}
                placeholder={f.placeholder}
              />
            )}
          </FormField>
        ))}

        <FormField id={`start-${optionId}`} label={startLabel} error={e.start_date} className="sm:col-span-3">
          <Input id={`start-${optionId}`} name="start_date" type="date" defaultValue={v("start_date", item?.start_date)} />
        </FormField>
        <FormField id={`end-${optionId}`} label={endLabel} error={e.end_date} className="sm:col-span-3">
          <Input id={`end-${optionId}`} name="end_date" type="date" defaultValue={v("end_date", item?.end_date)} />
        </FormField>
      </div>

      <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-6">
        <FormField id={`qty-${optionId}`} label="Qtd." error={e.quantity} className="sm:col-span-1">
          <Input id={`qty-${optionId}`} name="quantity" type="number" min={1} max={999} value={money.quantity} onChange={(ev) => setMoney((m) => ({ ...m, quantity: ev.target.value }))} />
        </FormField>
        <FormField id={`cost-${optionId}`} label="Custo unit." hint="Líquido do fornecedor" error={e.unit_cost_cents} className="sm:col-span-2">
          <Input id={`cost-${optionId}`} name="unit_cost_cents" inputMode="decimal" value={money.cost} onChange={(ev) => setMoney((m) => ({ ...m, cost: ev.target.value }))} placeholder="0,00" />
        </FormField>
        <FormField id={`fees-${optionId}`} label="Taxas unit." hint="Embarque, impostos…" error={e.unit_fees_cents} className="sm:col-span-1">
          <Input id={`fees-${optionId}`} name="unit_fees_cents" inputMode="decimal" value={money.fees} onChange={(ev) => setMoney((m) => ({ ...m, fees: ev.target.value }))} placeholder="0,00" />
        </FormField>
        <FormField id={`markup-${optionId}`} label="Markup unit." hint="Seu ganho" error={e.unit_markup_cents} className="sm:col-span-2">
          <Input id={`markup-${optionId}`} name="unit_markup_cents" inputMode="decimal" value={money.markup} onChange={(ev) => setMoney((m) => ({ ...m, markup: ev.target.value }))} placeholder="0,00" />
        </FormField>
        {showMargin ? (
          <div className="flex items-end gap-2 sm:col-span-3">
            <FormField id={`target-${optionId}`} label="Ou margem desejada (%)" className="flex-1">
              <Input id={`target-${optionId}`} inputMode="decimal" value={targetMargin} onChange={(ev) => setTargetMargin(ev.target.value)} placeholder="Ex.: 12" />
            </FormField>
            <Button type="button" variant="outline" onClick={applyMargin}>
              Aplicar
            </Button>
          </div>
        ) : null}
        <FormField id={`commission-${optionId}`} label="Comissão (total)" hint="Paga pelo fornecedor à agência" error={e.commission_cents} className="sm:col-span-3">
          <Input id={`commission-${optionId}`} name="commission_cents" inputMode="decimal" defaultValue={v("commission_cents", centsToInput(item?.commission_cents))} placeholder="0,00" />
        </FormField>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm sm:col-span-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="show_price_to_customer" defaultChecked={item ? item.show_price_to_customer : true} className="size-4 accent-primary" />
            Mostrar o preço deste item na proposta
          </label>
          <span>
            Preço ao cliente: <strong className="tabular-nums">{formatMoney(price, currency)}</strong>
            {showMargin && price > 0 ? (
              <span className="ml-2 text-muted-foreground">markup {formatMoney(markupTotal, currency)} ({Math.round((markupTotal / price) * 1000) / 10}%)</span>
            ) : null}
          </span>
        </div>
      </div>

      <FormField id={`desc-${optionId}`} label="Observações do item" error={e.description}>
        <textarea
          id={`desc-${optionId}`}
          name="description"
          defaultValue={v("description", item?.description)}
          rows={2}
          maxLength={2000}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </FormField>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {item ? "Salvar item" : "Adicionar item"}
        </Button>
      </div>
    </form>
  );
}
