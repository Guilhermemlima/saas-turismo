import { cookies } from "next/headers";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ROLE_LABELS } from "@/lib/permissions";
import { can, requireTenant } from "@/server/auth/tenant";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireTenant();
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        permissions={[...ctx.permissions]}
        activeAgencyId={ctx.agencyId}
        agencies={ctx.memberships.map((m) => ({ id: m.agencyId, name: m.agencyName, roleLabel: ROLE_LABELS[m.role] }))}
        user={{ name: ctx.fullName, email: ctx.email, roleLabel: ROLE_LABELS[ctx.role] }}
      />
      <SidebarInset>
        <AppHeader agencyName={ctx.agencyName} canSearchCustomers={can(ctx, "customers.read")} />
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
