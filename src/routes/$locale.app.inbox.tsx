import { createFileRoute } from "@tanstack/react-router";

import { NotificationCenterClient } from "@/components/dashboard/notification-center-client";
import { dashboardPageTitle } from "@/lib/page-title";
export const Route = createFileRoute("/$locale/app/inbox")({
  head: ({ match }) => ({
    meta: [
      {
        title: dashboardPageTitle(
          match.context.messages.notificationCenter.title,
          match.context,
        ),
      },
    ],
  }),
  component: Page,
});
function Page() {
  const { locale, messages } = Route.useRouteContext();
  return <NotificationCenterClient locale={locale} messages={messages} />;
}
