"use client";

import { Check, ChevronsUpDown, Compass, Plus } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { APP_NAME } from "@/config/app";
import { switchAgencyAction } from "@/modules/agencies/actions";

export type AgencyOption = { id: string; name: string; roleLabel: string };

export function AgencySwitcher({ agencies, activeAgencyId }: { agencies: AgencyOption[]; activeAgencyId: string }) {
  const [pending, startTransition] = useTransition();
  const active = agencies.find((a) => a.id === activeAgencyId) ?? agencies[0];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" disabled={pending} />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Compass className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{active?.name ?? APP_NAME}</span>
              <span className="truncate text-xs text-muted-foreground">{active?.roleLabel}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Agências</DropdownMenuLabel>
              {agencies.map((agency) => (
                <DropdownMenuItem
                  key={agency.id}
                  onClick={() => {
                    if (agency.id !== activeAgencyId) startTransition(() => switchAgencyAction(agency.id));
                  }}
                >
                  <span className="flex-1 truncate">{agency.name}</span>
                  {agency.id === activeAgencyId ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/onboarding?new=1" />}>
              <Plus /> Nova agência
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
