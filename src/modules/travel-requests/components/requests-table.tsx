import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTripDates } from "@/lib/dates";
import { formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";

import { completionPercent } from "../completeness";
import type { TravelRequestWithRelations } from "../repository";
import { RequestStatusBadge, StageBadge } from "./badges";

export function passengersLabel(r: Pick<TravelRequestWithRelations, "adults" | "children" | "infants">): string | null {
  const total = (r.adults ?? 0) + r.children + r.infants;
  if (!r.adults && total === 0) return null;
  return `${total} passageiro${total === 1 ? "" : "s"}`;
}

export function RequestsTable({ items, showCustomer = true }: { items: TravelRequestWithRelations[]; showCustomer?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Viagem</TableHead>
            {showCustomer ? <TableHead className="hidden md:table-cell">Cliente</TableHead> : null}
            <TableHead className="hidden sm:table-cell">Datas</TableHead>
            <TableHead className="hidden lg:table-cell">Passageiros</TableHead>
            <TableHead className="hidden lg:table-cell">Orçamento</TableHead>
            <TableHead>Etapa</TableHead>
            <TableHead className="hidden xl:table-cell">Consultor</TableHead>
            <TableHead className="pr-4 text-right">Atualizada</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.id} className="relative">
              <TableCell className="pl-4">
                <Link
                  href={`/requests/${r.id}`}
                  className="font-medium after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {r.destination || "Destino a definir"}
                </Link>
                <div className="mt-1 flex items-center gap-2">
                  <RequestStatusBadge status={r.status} />
                  {r.status === "collecting" ? (
                    <span className="text-xs text-muted-foreground tabular-nums">{completionPercent(r)}%</span>
                  ) : null}
                </div>
              </TableCell>
              {showCustomer ? <TableCell className="hidden md:table-cell">{r.customer?.full_name ?? "—"}</TableCell> : null}
              <TableCell className="hidden whitespace-nowrap sm:table-cell">
                {formatTripDates(r.departure_date, r.return_date, r.travel_month) ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="hidden lg:table-cell">{passengersLabel(r) ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="hidden tabular-nums lg:table-cell">
                {r.budget_cents !== null ? formatMoney(r.budget_cents, r.budget_currency) : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <StageBadge stage={r.deal?.stage} />
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                {r.deal?.assigned?.display_name || r.deal?.assigned?.profile?.full_name || <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="pr-4 text-right text-muted-foreground">{formatRelative(r.updated_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
