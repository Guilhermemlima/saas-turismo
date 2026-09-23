"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { findNavItem } from "@/config/navigation";

import { NotificationsMenu, type HeaderNotification } from "./notifications-menu";

export function AppHeader({
  agencyName,
  canSearchCustomers,
  notifications,
  unreadNotifications,
}: {
  agencyName: string;
  canSearchCustomers: boolean;
  notifications: HeaderNotification[];
  unreadNotifications: number;
}) {
  const pathname = usePathname();
  const current = findNavItem(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur supports-backdrop-filter:bg-background/65 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-vertical:h-4" />
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="hidden truncate text-muted-foreground sm:inline">{agencyName}</span>
        <span className="hidden text-muted-foreground/60 sm:inline">/</span>
        <span className="truncate font-medium">{current?.title ?? "Início"}</span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {canSearchCustomers ? (
          <form action="/customers" role="search" className="relative hidden md:block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              type="search"
              placeholder="Buscar clientes…"
              aria-label="Buscar clientes"
              className="h-8 w-64 pl-8"
              maxLength={100}
            />
          </form>
        ) : null}

        <NotificationsMenu items={notifications} unread={unreadNotifications} />
        <ThemeToggle />
      </div>
    </header>
  );
}
