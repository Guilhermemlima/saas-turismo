"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markNotificationsReadAction } from "@/modules/notifications/actions";

export type HeaderNotification = { id: string; title: string; body: string | null; href: string | null; read: boolean; createdAt: string };

export function NotificationsMenu({ items, unread }: { items: HeaderNotification[]; unread: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={unread ? `Notificações (${unread} novas)` : "Notificações"} className="relative" />}
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notificações</span>
          {unread > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => markNotificationsReadAction())}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" /> Marcar como lidas
            </button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhuma notificação por enquanto.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => {
              const content = (
                <>
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", !n.read && "font-medium")}>{n.title}</span>
                    {n.body ? <span className="block truncate text-xs text-muted-foreground">{n.body}</span> : null}
                    <span className="text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</span>
                  </span>
                </>
              );
              return (
                <li key={n.id} className="border-b last:border-b-0">
                  {n.href ? (
                    <Link
                      href={n.href}
                      onClick={() => {
                        if (!n.read) startTransition(() => markNotificationsReadAction([n.id]));
                      }}
                      className="flex gap-2 px-3 py-2.5 hover:bg-muted"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="flex gap-2 px-3 py-2.5">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
