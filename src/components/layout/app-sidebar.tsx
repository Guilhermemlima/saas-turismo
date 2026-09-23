"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NAVIGATION } from "@/config/navigation";
import type { Permission } from "@/lib/permissions";

import { AgencySwitcher, type AgencyOption } from "./agency-switcher";
import { UserMenu } from "./user-menu";

type AppSidebarProps = {
  permissions: Permission[];
  agencies: AgencyOption[];
  activeAgencyId: string;
  user: { name: string; email: string; roleLabel: string };
};

export function AppSidebar({ permissions, agencies, activeAgencyId, user }: AppSidebarProps) {
  const pathname = usePathname();
  const allowed = new Set(permissions);

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <AgencySwitcher agencies={agencies} activeAgencyId={activeAgencyId} />
      </SidebarHeader>

      <SidebarContent>
        {NAVIGATION.map((group) => {
          const items = group.items.filter((item) => !item.permission || allowed.has(item.permission));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton isActive={active} tooltip={item.title} render={<Link href={item.href} />}>
                          <item.icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                        {item.phase ? (
                          <SidebarMenuBadge className="text-[10px] font-normal text-muted-foreground">em breve</SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
