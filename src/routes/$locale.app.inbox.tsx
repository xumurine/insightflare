import { createFileRoute } from "@tanstack/react-router";

import { NotificationCenterClient } from "@/components/dashboard/notification-center-client";
export const Route = createFileRoute("/$locale/app/inbox")({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.notificationCenter.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages } = Route.useRouteContext();
  return <NotificationCenterClient locale={locale} messages={messages} />;
}
