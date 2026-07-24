import { createFileRoute, notFound } from "@tanstack/react-router";

import { SystemPerformanceClient } from "@/components/dashboard/system-performance-client";
import { dashboardPageTitle } from "@/lib/page-title";
export const Route = createFileRoute("/$locale/app/manage/system-performance")({
  beforeLoad: ({ context }) => {
    if (context.dashboardRoot?.user.systemRole !== "admin") throw notFound();
  },
  head: ({ match }) => ({
    meta: [
      {
        title: dashboardPageTitle(
          match.context.messages.systemPerformance.title,
          match.context,
        ),
      },
    ],
  }),
  component: Page,
});
function Page() {
  const { locale, messages } = Route.useRouteContext();
  return <SystemPerformanceClient locale={locale} messages={messages} />;
}
