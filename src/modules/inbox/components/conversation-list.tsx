import { FlaskConical, MessageCircle, Search } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ConversationListItem, InboxFilter } from "../repository";

const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "mine", label: "Minhas" },
  { value: "unread", label: "Não lidas" },
];

function hrefFor(filter: InboxFilter, q: string, conversationId?: string) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (q) params.set("q", q);
  const qs = params.toString();
  return `/inbox${conversationId ? `/${conversationId}` : ""}${qs ? `?${qs}` : ""}`;
}

export function ConversationList({
  items,
  selectedId,
  filter,
  q,
}: {
  items: ConversationListItem[];
  selectedId?: string;
  filter: InboxFilter;
  q: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-2 border-b p-3">
        <form action={selectedId ? `/inbox/${selectedId}` : "/inbox"} className="relative">
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Buscar cliente"
            aria-label="Buscar conversa por cliente"
            maxLength={100}
            className="h-8 w-full rounded-lg border border-input bg-transparent pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </form>
        <nav className="inline-flex w-fit rounded-lg bg-muted p-0.5 text-xs" aria-label="Filtrar conversas">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={hrefFor(f.value, q, selectedId)}
              aria-current={filter === f.value ? "page" : undefined}
              className={cn("rounded-md px-2.5 py-1 text-muted-foreground transition-colors", filter === f.value && "bg-background text-foreground shadow-sm")}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <MessageCircle className="size-6" />
          {q || filter !== "all" ? "Nenhuma conversa com esse filtro." : "Nenhuma conversa aberta ainda."}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {items.map((c) => {
            const active = c.id === selectedId;
            return (
              <li key={c.id}>
                <Link
                  href={hrefFor(filter, q, c.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex gap-3 border-b px-3 py-3 transition-colors hover:bg-muted/60", active && "bg-accent/70 hover:bg-accent/70")}
                >
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-muted text-xs font-medium">{initials(c.customer?.full_name ?? "?")}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("flex-1 truncate text-sm", c.unread_count > 0 ? "font-semibold" : "font-medium")}>
                        {c.customer?.full_name ?? "Cliente"}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(c.last_message_at)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="flex-1 truncate text-xs text-muted-foreground">{c.last_message_preview ?? "Sem mensagens"}</span>
                      {c.unread_count > 0 ? (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                          {c.unread_count}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex gap-1.5">
                      {c.is_simulation ? (
                        <span className="inline-flex items-center gap-1 rounded bg-warm/15 px-1.5 text-[10px] text-warm-foreground">
                          <FlaskConical className="size-2.5" /> Simulação
                        </span>
                      ) : null}
                      <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{c.mode === "ai" ? "IA" : "Humano"}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
