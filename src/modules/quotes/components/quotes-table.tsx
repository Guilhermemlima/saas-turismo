import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { QuoteStatus } from "@/server/db/database.types";

import { QUOTE_STATUS_LABELS } from "../labels";
import type { QuoteListItem } from "../repository";

const STATUS_CLASSES: Record<QuoteStatus, string> = {
  draft: "border-warm/60 text-warm-foreground",
  ready: "border-success/50 text-success",
  archived: "border-border text-muted-foreground",
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap", STATUS_CLASSES[status])}>
      {QUOTE_STATUS_LABELS[status]}
    </span>
  );
}

/** "R$ 8.000" or "R$ 6.500 – R$ 9.800" across the options that have items. */
export function priceRange(options: { total_cents: number; items_count: number }[], currency: string): string | null {
  const totals = options.filter((o) => o.items_count > 0).map((o) => o.total_cents);
  if (totals.length === 0) return null;
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  return min === max ? formatMoney(min, currency) : `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`;
}

export function QuotesTable({ items }: { items: QuoteListItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Cotação</TableHead>
            <TableHead className="hidden md:table-cell">Cliente</TableHead>
            <TableHead className="hidden sm:table-cell">Opções</TableHead>
            <TableHead>Valores</TableHead>
            <TableHead className="hidden lg:table-cell">Consultor</TableHead>
            <TableHead className="pr-4 text-right">Atualizada</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((q) => (
            <TableRow key={q.id} className="relative">
              <TableCell className="pl-4">
                <Link
                  href={`/quotes/${q.id}`}
                  className="font-medium after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {q.title}
                </Link>
                <div className="mt-1 flex items-center gap-2">
                  <QuoteStatusBadge status={q.status} />
                  {q.request?.destination ? <span className="text-xs text-muted-foreground">{q.request.destination}</span> : null}
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">{q.customer?.full_name ?? "—"}</TableCell>
              <TableCell className="hidden tabular-nums sm:table-cell">{q.options.length}</TableCell>
              <TableCell className="tabular-nums whitespace-nowrap">
                {priceRange(q.options, q.currency) ?? <span className="text-muted-foreground">Sem itens</span>}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {q.assigned ? (q.assigned.display_name ?? q.assigned.profile?.full_name ?? "—") : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="pr-4 text-right text-muted-foreground whitespace-nowrap">{formatRelative(q.updated_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
