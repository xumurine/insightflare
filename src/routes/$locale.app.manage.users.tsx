import { createFileRoute, notFound } from "@tanstack/react-router";

import { AdminUsersManagementClient } from "@/components/dashboard/admin-users-management-client";
import { dashboardPageTitle } from "@/lib/page-title";
export const Route = createFileRoute("/$locale/app/manage/users")({
  beforeLoad: ({ context }) => {
    if (context.dashboardRoot?.user.systemRole !== "admin") throw notFound();
  },
  head: ({ match }) => ({
    meta: [
      {
        title: dashboardPageTitle(
          match.context.messages.adminUsers.title,
          match.context,
        ),
      },
    ],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, dashboardRoot } = Route.useRouteContext();
  if (!dashboardRoot) throw notFound();
  return (
    <AdminUsersManagementClient
      locale={locale}
      messages={messages}
      currentUserId={dashboardRoot.user.id}
    />
  );
}
