import { createFileRoute, Outlet } from "@tanstack/react-router";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { loadDashboardRoot } from "@/lib/dashboard/route-data";
import { buildManagementSections } from "@/lib/dashboard/team-sections";
import { usePathname } from "@/lib/router";

export const Route = createFileRoute("/$locale/app")({
  beforeLoad: async () => ({ dashboardRoot: await loadDashboardRoot() }),
  component: AppLayout,
});

function AppLayout() {
  const { locale, messages, dashboardRoot } = Route.useRouteContext();
  const pathname = usePathname();

  if (!dashboardRoot) return <Outlet />;
  return (
    <DashboardShell
      locale={locale}
      pathname={pathname}
      messages={messages}
      user={dashboardRoot.user}
      teams={dashboardRoot.teams}
      teamGroups={dashboardRoot.teamGroups}
      unreadAttentionCount={dashboardRoot.unreadAttentionCount}
      managementSections={
        dashboardRoot.user.systemRole === "admin"
          ? buildManagementSections(locale, messages)
          : undefined
      }
    >
      <Outlet />
    </DashboardShell>
  );
}
