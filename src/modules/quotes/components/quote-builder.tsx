"use client";

import {
  Archive,
  BedDouble,
  Bus,
  CheckCircle2,
  Compass,
  Copy,
  Loader2,
  Package,
  Pencil,
  Plane,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField, NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { formatDate } from "@/lib/format";
import { centsToInput, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { QuoteItemType, QuoteStatus } from "@/server/db/database.types";

import {
  addOptionAction,
  deleteItemAction,
  deleteOptionAction,
  duplicateOptionAction,
  saveItemAction,
  setQuoteStatusAction,
  updateOptionAction,
  updateQuoteAction,
} from "../actions";
import {
  FLIGHT_CABIN_LABELS,
  FLIGHT_CABINS,
  itemDetailsSummary,
  QUOTE_CURRENCIES,
  QUOTE_CURRENCY_LABELS,
  QUOTE_ITEM_TYPE_LABELS,
  QUOTE_ITEM_TYPES,
  TRANSFER_KIND_LABELS,
  TRANSFER_KINDS,
} from "../labels";
import { marginPercent, type OptionTotals } from "../pricing";
import { DETAIL_PREFIX } from "../schemas";

export type BuilderItem = {
  id: string;
  item_type: QuoteItemType;
  title: string;
  description: string | null;
  supplier_name: string | null;
  start_date: string | null;
  end_date: string | null;
  quantity: number;
  cost_cents: number;
  markup_cents: number;
  pass_through_fees_cents: number;
  commission_cents: number;
  price_cents: number;
  total_cents: number;
  show_price_to_customer: boolean;
  details: unknown;
};

export type BuilderOption = {
  id: string;
  title: string;
  description: string | null;
  service_fee_cents: number;
  discount_cents: number;
  /** Computed by the database (migration 0014); internal values are zeroed without quotes.view_margin. */
  totals: OptionTotals;
  items: BuilderItem[];
};

export type BuilderQuote = {
  id: string;
  title: string;
  status: QuoteStatus;
  currency: string;
  assigned_member_id: string | null;
  internal_notes: string | null;
  options: BuilderOption[];
};

const ITEM_ICONS: Record<QuoteItemType, LucideIcon> = {
  flight: Plane,
  hotel: BedDouble,
  transfer: Bus,
  tour: Compass,
  insurance: ShieldCheck,
  other: Package,
};

const MEAL_PLANS = [
  ["room_only", "Só hospedagem"],
  ["breakfast", "Café da manhã"],
  ["half_board", "Meia pensão"],
  ["full_board", "Pensão completa"],
  ["all_inclusive", "All inclusive"],
] as const;

function useToastResult(state: ActionState, onSuccess?: () => void) {
  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      onSuccess?.();
    }
    if (state.status === "error" && !state.fieldErrors) toast.error(state.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to new results only
  }, [state]);
}

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.status === "error") toast.error(result.message);
      else if (result.message) toast.success(result.message);
    });
  return { pending, run };
}

export function QuoteBuilder({
  quote,
  members,
  canWrite,
  showMargin,
}: {
  quote: BuilderQuote;
  members: { id: string; name: string }[];
  canWrite: boolean;
  showMargin: boolean;
}) {
  const editable = canWrite && quote.status === "draft";
  const { pending, run } = useRun();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        {quote.options.map((option, index) => (
          <OptionCard
            key={option.id}
            option={option}
            index={index}
            currency={quote.currency}
            editable={editable}
            showMargin={showMargin}
            canRemove={quote.options.length > 1}
          />
        ))}
        {editable ? (
          <Button variant="outline" className="w-fit" disabled={pending} onClick={() => run(() => addOptionAction(quote.id))}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />}
            Adicionar opção
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        {canWrite ? <StatusCard quote={quote} /> : null}
        <Card>
          <CardHeader>
            <CardTitle>Dados da cotação</CardTitle>
            <CardDescription>{editable ? "Uso interno: não aparece para o cliente." : "Somente leitura."}</CardDescription>
          </CardHeader>
          <CardContent>
            <QuoteSettingsForm quote={quote} members={members} readOnly={!editable} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusCard({ quote }: { quote: BuilderQuote }) {
  const { pending, run } = useRun();
  const hasItems = quote.options.some((o) => o.items.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Andamento</CardTitle>
        <CardDescription>
          {quote.status === "draft"
            ? "Quando as opções estiverem completas, marque como pronta: o negócio avança no CRM e a tarefa de cotação é concluída."
            : quote.status === "ready"
              ? "Pronta para virar proposta. Para editar, reabra a cotação."
              : "Cotação arquivada."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {quote.status === "draft" ? (
          <Button disabled={pending || !hasItems} onClick={() => run(() => setQuoteStatusAction(quote.id, "ready"))}>
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Marcar como pronta
          </Button>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => run(() => setQuoteStatusAction(quote.id, "draft"))}>
            <RotateCcw /> Reabrir para edição
          </Button>
        )}
        {quote.status !== "archived" ? (
          <Button variant="ghost" disabled={pending} onClick={() => run(() => setQuoteStatusAction(quote.id, "archived"))}>
            <Archive /> Arquivar
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function QuoteSettingsForm({ quote, members, readOnly }: { quote: BuilderQuote; members: { id: string; name: string }[]; readOnly: boolean }) {
  const [state, action, pending] = useActionState(updateQuoteAction.bind(null, quote.id), initialActionState);
  const e = state.fieldErrors ?? {};
  const v = state.values;
  useToastResult(state);

  return (
    <form action={action} className="grid gap-3" noValidate>
      <fieldset disabled={readOnly} className="grid gap-3">
        <FormField id="q_title" label="Título" required error={e.title}>
          <Input id="q_title" name="title" defaultValue={v?.title ?? quote.title} maxLength={120} aria-invalid={Boolean(e.title)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField id="q_currency" label="Moeda" error={e.currency}>
            <NativeSelect id="q_currency" name="currency" defaultValue={v?.currency ?? quote.currency}>
              {QUOTE_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {QUOTE_CURRENCY_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="q_assigned" label="Consultor">
            <NativeSelect id="q_assigned" name="assigned_member_id" defaultValue={v?.assigned_member_id ?? quote.assigned_member_id ?? ""}>
              <option value="">Ninguém</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <FormField id="q_notes" label="Observações internas" error={e.internal_notes}>
          <Textarea id="q_notes" name="internal_notes" rows={4} defaultValue={v?.internal_notes ?? quote.internal_notes ?? ""} maxLength={4000} />
        </FormField>
      </fieldset>
      {!readOnly ? (
        <Button type="submit" variant="outline" disabled={pending} className="w-fit justify-self-end">
          {pending ? <Loader2 className="animate-spin" /> : null}
          Salvar
        </Button>
      ) : null}
    </form>
  );
}

// Options --------------------------------------------------------------------------------------------
function OptionCard({
  option,
  index,
  currency,
  editable,
  showMargin,
  canRemove,
}: {
  option: BuilderOption;
  index: number;
  currency: string;
  editable: boolean;
  showMargin: boolean;
  canRemove: boolean;
}) {
  const { pending, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [itemDialog, setItemDialog] = useState<{ item: BuilderItem | null } | null>(null);
  const totals = option.totals;
  const money = (cents: number) => formatMoney(cents, currency);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">Opção {index + 1}</p>
          <CardTitle className="text-lg">{option.title}</CardTitle>
          {option.description ? <CardDescription className="whitespace-pre-line">{option.description}</CardDescription> : null}
        </div>
        {editable ? (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Editar opção" onClick={() => setEditing(true)}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Duplicar opção" disabled={pending} onClick={() => run(() => duplicateOptionAction(option.id))}>
              <Copy />
            </Button>
            {canRemove ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remover opção"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Remover “${option.title}” e todos os seus itens?`)) run(() => deleteOptionAction(option.id));
                }}
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {option.items.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum item. Adicione voos, hospedagem, transfers, passeios ou seguro.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {option.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                currency={currency}
                editable={editable}
                showMargin={showMargin}
                onEdit={() => setItemDialog({ item })}
              />
            ))}
          </ul>
        )}

        {editable ? (
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setItemDialog({ item: null })}>
            <Plus /> Adicionar item
          </Button>
        ) : null}

        <dl className="grid gap-1.5 rounded-xl bg-muted/50 p-4 text-sm">
          <TotalRow label="Subtotal dos itens" value={money(totals.subtotal_cents)} />
          {totals.service_fee_cents > 0 ? <TotalRow label="Taxa de serviço" value={money(totals.service_fee_cents)} /> : null}
          {totals.discount_cents > 0 ? <TotalRow label="Desconto" value={`− ${money(totals.discount_cents)}`} /> : null}
          <TotalRow label="Total para o cliente" value={money(totals.total_cents)} strong />
          {showMargin ? (
            <div className="mt-2 grid gap-1.5 border-t pt-2 text-xs text-muted-foreground">
              <TotalRow label="Custo (fornecedores)" value={money(totals.cost_total_cents)} />
              <TotalRow
                label="Margem"
                value={`${money(totals.margin_cents)}${marginPercent(totals) !== null ? ` · ${String(marginPercent(totals)).replace(".", ",")}%` : ""}`}
              />
              <TotalRow label="Comissão a receber" value={money(totals.commission_total_cents)} />
              <TotalRow label="Lucro bruto" value={money(totals.gross_profit_cents)} />
            </div>
          ) : null}
        </dl>
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar opção</DialogTitle>
            <DialogDescription>Nome e descrição aparecem na proposta; taxa e desconto entram no total.</DialogDescription>
          </DialogHeader>
          {editing ? <OptionForm option={option} onDone={() => setEditing(false)} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={itemDialog !== null} onOpenChange={(open) => !open && setItemDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{itemDialog?.item ? "Editar item" : "Novo item"}</DialogTitle>
            <DialogDescription>Valores unitários; o total multiplica pela quantidade. Markup e comissão aceitam % do custo (ex.: 10%).</DialogDescription>
          </DialogHeader>
          {itemDialog ? <ItemForm optionId={option.id} item={itemDialog.item} onDone={() => setItemDialog(null)} /> : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", strong && "text-base font-semibold")}>
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function OptionForm({ option, onDone }: { option: BuilderOption; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateOptionAction.bind(null, option.id), initialActionState);
  const e = state.fieldErrors ?? {};
  const v = state.values;
  useToastResult(state, onDone);

  return (
    <form action={action} className="grid gap-3" noValidate>
      <FormField id="o_title" label="Nome da opção" required error={e.title}>
        <Input id="o_title" name="title" defaultValue={v?.title ?? option.title} maxLength={120} placeholder="Ex.: Resort all inclusive" />
      </FormField>
      <FormField id="o_description" label="Descrição" error={e.description}>
        <Textarea id="o_description" name="description" rows={3} defaultValue={v?.description ?? option.description ?? ""} maxLength={2000} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="o_fee" label="Taxa de serviço (RAV/DU)" error={e.service_fee_cents}>
          <Input id="o_fee" name="service_fee_cents" inputMode="decimal" defaultValue={v?.service_fee_cents ?? centsToInput(option.service_fee_cents || null)} placeholder="0,00" />
        </FormField>
        <FormField id="o_discount" label="Desconto" error={e.discount_cents}>
          <Input id="o_discount" name="discount_cents" inputMode="decimal" defaultValue={v?.discount_cents ?? centsToInput(option.discount_cents || null)} placeholder="0,00" />
        </FormField>
      </div>
      <Button type="submit" disabled={pending} className="justify-self-end">
        {pending ? <Loader2 className="animate-spin" /> : null}
        Salvar opção
      </Button>
    </form>
  );
}

// Items ----------------------------------------------------------------------------------------------
function ItemRow({
  item,
  currency,
  editable,
  showMargin,
  onEdit,
}: {
  item: BuilderItem;
  currency: string;
  editable: boolean;
  showMargin: boolean;
  onEdit: () => void;
}) {
  const { pending, run } = useRun();
  const Icon = ITEM_ICONS[item.item_type];
  const summary = itemDetailsSummary(item.item_type, item.details);
  const dates = item.start_date
    ? item.end_date && item.end_date !== item.start_date
      ? `${formatDate(item.start_date)} – ${formatDate(item.end_date)}`
      : formatDate(item.start_date)
    : null;

  return (
    <li className="flex items-start gap-3 p-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" title={QUOTE_ITEM_TYPE_LABELS[item.item_type]}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{item.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[QUOTE_ITEM_TYPE_LABELS[item.item_type], summary, dates, item.supplier_name].filter(Boolean).join(" · ")}
        </p>
        {showMargin ? (
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            Custo {formatMoney(item.cost_cents, currency)} · markup {formatMoney(item.markup_cents, currency)}
            {item.pass_through_fees_cents ? ` · taxas ${formatMoney(item.pass_through_fees_cents, currency)}` : ""}
            {item.commission_cents ? ` · comissão ${formatMoney(item.commission_cents, currency)}` : ""}
          </p>
        ) : null}
        {!item.show_price_to_customer ? <p className="mt-1 text-xs text-muted-foreground">Preço embutido no pacote (não detalhado ao cliente)</p> : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium tabular-nums">{formatMoney(item.total_cents, currency)}</p>
        {item.quantity > 1 ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {item.quantity} × {formatMoney(item.price_cents, currency)}
          </p>
        ) : null}
      </div>
      {editable ? (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Editar item" onClick={onEdit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Remover item" disabled={pending} onClick={() => run(() => deleteItemAction(item.id))}>
            <Trash2 />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function detail(item: BuilderItem | null, key: string): string {
  if (!item || !item.details || typeof item.details !== "object") return "";
  const value = (item.details as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function ItemForm({ optionId, item, onDone }: { optionId: string; item: BuilderItem | null; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveItemAction.bind(null, optionId, item?.id ?? null), initialActionState);
  const e = state.fieldErrors ?? {};
  const v = state.values;
  const [type, setType] = useState<QuoteItemType>((v?.item_type as QuoteItemType | undefined) ?? item?.item_type ?? "flight");
  useToastResult(state, onDone);

  const d = (key: string) => v?.[`${DETAIL_PREFIX}${key}`] ?? detail(item, key);
  const de = (key: string) => e[`${DETAIL_PREFIX}${key}`];
  const moneyDefault = (field: string, cents: number | undefined) => v?.[field] ?? (cents ? centsToInput(cents) : "");

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6" noValidate>
      <FormField id="i_type" label="Tipo" className="sm:col-span-2">
        <NativeSelect id="i_type" name="item_type" value={type} onChange={(ev) => setType(ev.target.value as QuoteItemType)}>
          {QUOTE_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {QUOTE_ITEM_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="i_title" label="Descrição do item" required error={e.title} className="sm:col-span-4">
        <Input
          id="i_title"
          name="title"
          defaultValue={v?.title ?? item?.title ?? ""}
          maxLength={160}
          placeholder={type === "hotel" ? "Ex.: Resort Salinas Maragogi" : type === "flight" ? "Ex.: Voo ida e volta São Paulo – Maceió" : ""}
          aria-invalid={Boolean(e.title)}
        />
      </FormField>

      {type === "flight" ? (
        <>
          <FormField id="d_airline" label="Companhia" error={de("airline")} className="sm:col-span-2">
            <Input id="d_airline" name="d_airline" defaultValue={d("airline")} maxLength={80} />
          </FormField>
          <FormField id="d_route" label="Trecho" error={de("route")} className="sm:col-span-2">
            <Input id="d_route" name="d_route" defaultValue={d("route")} maxLength={160} placeholder="GRU → MCZ → GRU" />
          </FormField>
          <FormField id="d_flight_numbers" label="Voos" error={de("flight_numbers")} className="sm:col-span-2">
            <Input id="d_flight_numbers" name="d_flight_numbers" defaultValue={d("flight_numbers")} maxLength={80} placeholder="LA3310 / LA3311" />
          </FormField>
          <FormField id="d_cabin" label="Classe" error={de("cabin")} className="sm:col-span-2">
            <NativeSelect id="d_cabin" name="d_cabin" defaultValue={d("cabin")}>
              <option value="">—</option>
              {FLIGHT_CABINS.map((c) => (
                <option key={c} value={c}>
                  {FLIGHT_CABIN_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="d_stops" label="Escalas" error={de("stops")} className="sm:col-span-2">
            <Input id="d_stops" name="d_stops" type="number" min={0} max={5} defaultValue={d("stops")} />
          </FormField>
          <FormField id="d_baggage" label="Bagagem" error={de("baggage")} className="sm:col-span-2">
            <Input id="d_baggage" name="d_baggage" defaultValue={d("baggage")} maxLength={120} placeholder="1 mala de 23 kg" />
          </FormField>
        </>
      ) : null}

      {type === "hotel" ? (
        <>
          <FormField id="d_category" label="Categoria" error={de("category")} className="sm:col-span-2">
            <NativeSelect id="d_category" name="d_category" defaultValue={d("category")}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} estrela{n > 1 ? "s" : ""}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="d_room_type" label="Tipo de quarto" error={de("room_type")} className="sm:col-span-2">
            <Input id="d_room_type" name="d_room_type" defaultValue={d("room_type")} maxLength={120} placeholder="Luxo vista mar" />
          </FormField>
          <FormField id="d_rooms" label="Quartos" error={de("rooms")} className="sm:col-span-1">
            <Input id="d_rooms" name="d_rooms" type="number" min={1} max={50} defaultValue={d("rooms")} />
          </FormField>
          <FormField id="d_meal_plan" label="Regime" error={de("meal_plan")} className="sm:col-span-1">
            <NativeSelect id="d_meal_plan" name="d_meal_plan" defaultValue={d("meal_plan")}>
              <option value="">—</option>
              {MEAL_PLANS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </>
      ) : null}

      {type === "transfer" ? (
        <>
          <FormField id="d_from_place" label="De" error={de("from_place")} className="sm:col-span-2">
            <Input id="d_from_place" name="d_from_place" defaultValue={d("from_place")} maxLength={120} placeholder="Aeroporto de Maceió" />
          </FormField>
          <FormField id="d_to_place" label="Para" error={de("to_place")} className="sm:col-span-2">
            <Input id="d_to_place" name="d_to_place" defaultValue={d("to_place")} maxLength={120} placeholder="Hotel" />
          </FormField>
          <FormField id="d_transfer_kind" label="Tipo" error={de("transfer_kind")} className="sm:col-span-2">
            <NativeSelect id="d_transfer_kind" name="d_transfer_kind" defaultValue={d("transfer_kind")}>
              <option value="">—</option>
              {TRANSFER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {TRANSFER_KIND_LABELS[k]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </>
      ) : null}

      {type === "tour" ? (
        <>
          <FormField id="d_location" label="Local" error={de("location")} className="sm:col-span-3">
            <Input id="d_location" name="d_location" defaultValue={d("location")} maxLength={120} />
          </FormField>
          <FormField id="d_duration" label="Duração" error={de("duration")} className="sm:col-span-3">
            <Input id="d_duration" name="d_duration" defaultValue={d("duration")} maxLength={60} placeholder="Dia inteiro" />
          </FormField>
        </>
      ) : null}

      {type === "insurance" ? (
        <>
          <FormField id="d_plan" label="Plano" error={de("plan")} className="sm:col-span-3">
            <Input id="d_plan" name="d_plan" defaultValue={d("plan")} maxLength={120} />
          </FormField>
          <FormField id="d_coverage" label="Cobertura" error={de("coverage")} className="sm:col-span-3">
            <Input id="d_coverage" name="d_coverage" defaultValue={d("coverage")} maxLength={120} placeholder="USD 60 mil" />
          </FormField>
        </>
      ) : null}

      <FormField id="i_start" label="Início" error={e.start_date} className="sm:col-span-2">
        <Input id="i_start" name="start_date" type="date" defaultValue={v?.start_date ?? item?.start_date ?? ""} />
      </FormField>
      <FormField id="i_end" label="Fim" error={e.end_date} className="sm:col-span-2">
        <Input id="i_end" name="end_date" type="date" defaultValue={v?.end_date ?? item?.end_date ?? ""} />
      </FormField>
      <FormField id="i_supplier" label="Fornecedor" error={e.supplier_name} className="sm:col-span-2">
        <Input id="i_supplier" name="supplier_name" defaultValue={v?.supplier_name ?? item?.supplier_name ?? ""} maxLength={120} />
      </FormField>

      <FormField id="i_quantity" label="Quantidade" error={e.quantity} className="sm:col-span-2">
        <Input id="i_quantity" name="quantity" type="number" min={1} max={999} defaultValue={v?.quantity ?? String(item?.quantity ?? 1)} />
      </FormField>
      <FormField id="i_cost" label="Custo unitário" error={e.cost_cents} className="sm:col-span-2">
        <Input id="i_cost" name="cost_cents" inputMode="decimal" defaultValue={moneyDefault("cost_cents", item?.cost_cents)} placeholder="0,00" />
      </FormField>
      <FormField id="i_markup" label="Markup" error={e.markup} hint="Valor ou % do custo" className="sm:col-span-2">
        <Input id="i_markup" name="markup" defaultValue={moneyDefault("markup", item?.markup_cents)} placeholder="10% ou 250,00" />
      </FormField>
      <FormField id="i_fees" label="Taxas repassadas" error={e.pass_through_fees_cents} hint="Embarque, resort fee…" className="sm:col-span-3">
        <Input id="i_fees" name="pass_through_fees_cents" inputMode="decimal" defaultValue={moneyDefault("pass_through_fees_cents", item?.pass_through_fees_cents)} placeholder="0,00" />
      </FormField>
      <FormField id="i_commission" label="Comissão do fornecedor" error={e.commission} hint="Recebida pela agência; não soma ao preço" className="sm:col-span-3">
        <Input id="i_commission" name="commission" defaultValue={moneyDefault("commission", item?.commission_cents)} placeholder="0,00 ou 10%" />
      </FormField>

      <FormField id="i_description" label="Observações do item" error={e.description} className="sm:col-span-6">
        <Textarea id="i_description" name="description" rows={2} defaultValue={v?.description ?? item?.description ?? ""} maxLength={2000} />
      </FormField>

      <label className="flex items-center gap-2 text-sm sm:col-span-4">
        <input
          type="checkbox"
          name="show_price_to_customer"
          defaultChecked={v ? v.show_price_to_customer === "on" : (item?.show_price_to_customer ?? true)}
          className="size-4 accent-primary"
        />
        Mostrar o preço deste item ao cliente
      </label>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {item ? "Salvar item" : "Adicionar item"}
        </Button>
      </div>
    </form>
  );
}
