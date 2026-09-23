import { cookies } from "next/headers";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { RealtimeRefresh } from "@/components/shared/realtime-refresh";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ROLE_LABELS } from "@/lib/permissions";
import { publicStorageUrl } from "@/lib/storage";
import { listNotifications } from "@/modules/notifications/repository";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireTenant();
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  const notifications = await listNotifications(await createSupabaseServerClient(), ctx);

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        permissions={[...ctx.permissions]}
        activeAgencyId={ctx.agencyId}
        agencies={ctx.memberships.map((m) => ({
          id: m.agencyId,
          name: m.agencyName,
          roleLabel: ROLE_LABELS[m.role],
          logoUrl: publicStorageUrl("agency-logos", m.agencyLogoPath),
        }))}
        user={{ name: ctx.fullName, email: ctx.email, roleLabel: ROLE_LABELS[ctx.role] }}
      />
      <SidebarInset>
        <RealtimeRefresh channel={`notifications-${ctx.userId}`} subscriptions={[{ table: "notifications", filter: `user_id=eq.${ctx.userId}` }]} />
        <AppHeader
          agencyName={ctx.agencyName}
          canSearchCustomers={can(ctx, "customers.read")}
          notifications={notifications.items}
          unreadNotifications={notifications.unread}
        />
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
