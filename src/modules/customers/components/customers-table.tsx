import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatRelative } from "@/lib/format";
import { formatPhone } from "@/lib/phone";

import { TAG_COLOR_CLASSES } from "@/modules/customer-details/labels";

import type { CustomerListItem } from "../repository";
import { CUSTOMER_SOURCE_LABELS } from "../schemas";

export function CustomersTable({ items }: { items: CustomerListItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Cliente</TableHead>
            <TableHead className="hidden md:table-cell">Telefone</TableHead>
            <TableHead className="hidden lg:table-cell">Cidade</TableHead>
            <TableHead className="hidden lg:table-cell">Consultor</TableHead>
            <TableHead className="hidden sm:table-cell">Origem</TableHead>
            <TableHead className="hidden xl:table-cell">Último contato</TableHead>
            <TableHead className="pr-4 text-right">Cadastro</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((customer) => (
            <TableRow key={customer.id} className="relative">
              <TableCell className="pl-4">
                <Link
                  href={`/customers/${customer.id}`}
                  className="font-medium after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {customer.full_name}
                </Link>
                <div className="text-xs text-muted-foreground">{customer.email ?? formatPhone(customer.phone_e164)}</div>
                {customer.tags.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {customer.tags.slice(0, 3).map(({ tag }) =>
                      tag ? (
                        <span key={tag.id} className={`inline-flex h-4 items-center rounded-full px-1.5 text-[10px] font-medium ${TAG_COLOR_CLASSES[tag.color] ?? TAG_COLOR_CLASSES.slate}`}>
                          {tag.name}
                        </span>
                      ) : null,
                    )}
                    {customer.tags.length > 3 ? <span className="text-[10px] text-muted-foreground">+{customer.tags.length - 3}</span> : null}
                  </div>
                ) : null}
              </TableCell>
              <TableCell className="hidden tabular-nums md:table-cell">{formatPhone(customer.phone_e164) || "—"}</TableCell>
              <TableCell className="hidden lg:table-cell">
                {customer.city ? `${customer.city}${customer.state ? ` · ${customer.state}` : ""}` : "—"}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {customer.owner?.display_name || customer.owner?.profile?.full_name || <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <Badge variant="secondary">{CUSTOMER_SOURCE_LABELS[customer.source]}</Badge>
              </TableCell>
              <TableCell className="hidden text-muted-foreground xl:table-cell">{formatRelative(customer.last_contact_at)}</TableCell>
              <TableCell className="pr-4 text-right text-muted-foreground">{formatDate(customer.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
