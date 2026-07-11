import { createFileRoute, notFound } from "@tanstack/react-router";

import { SystemPerformanceClient } from "@/components/dashboard/system-performance-client";
export const Route = createFileRoute("/$locale/app/manage/system-performance")({
  beforeLoad: ({ context }) => {
    if (context.dashboardRoot?.user.systemRole !== "admin") throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.systemPerformance.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages } = Route.useRouteContext();
  return <SystemPerformanceClient locale={locale} messages={messages} />;
}
