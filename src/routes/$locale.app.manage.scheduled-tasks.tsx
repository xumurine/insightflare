import { createFileRoute, notFound } from "@tanstack/react-router";

import { ScheduledTasksClient } from "@/components/dashboard/scheduled-tasks-client";
export const Route = createFileRoute("/$locale/app/manage/scheduled-tasks")({
  beforeLoad: ({ context }) => {
    if (context.dashboardRoot?.user.systemRole !== "admin") throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.managementNav.scheduledTasks }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages } = Route.useRouteContext();
  return <ScheduledTasksClient locale={locale} messages={messages} />;
}
