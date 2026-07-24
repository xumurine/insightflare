import { createFileRoute, notFound } from "@tanstack/react-router";

import { AdminTeamsManagementClient } from "@/components/dashboard/admin-teams-management-client";
import { dashboardPageTitle } from "@/lib/page-title";
export const Route = createFileRoute("/$locale/app/manage/teams")({
  beforeLoad: ({ context }) => {
    if (context.dashboardRoot?.user.systemRole !== "admin") throw notFound();
  },
  head: ({ match }) => ({
    meta: [
      {
        title: dashboardPageTitle(
          match.context.messages.adminTeams.title,
          match.context,
        ),
      },
    ],
  }),
  component: Page,
});
function Page() {
  const { locale, messages } = Route.useRouteContext();
  return <AdminTeamsManagementClient locale={locale} messages={messages} />;
}
