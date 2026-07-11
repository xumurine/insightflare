import { createFileRoute, notFound } from "@tanstack/react-router";

import { AdminTeamsManagementClient } from "@/components/dashboard/admin-teams-management-client";
export const Route = createFileRoute("/$locale/app/manage/teams")({
  beforeLoad: ({ context }) => {
    if (context.dashboardRoot?.user.systemRole !== "admin") throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.adminTeams.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages } = Route.useRouteContext();
  return <AdminTeamsManagementClient locale={locale} messages={messages} />;
}
