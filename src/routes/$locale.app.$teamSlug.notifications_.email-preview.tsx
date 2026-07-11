import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotificationEmailPreviewClient } from "@/components/dashboard/notification-email-preview-client";
import { canManageTeam } from "@/lib/dashboard/permissions";

export const Route = createFileRoute(
  "/$locale/app/$teamSlug/notifications_/email-preview",
)({
  beforeLoad: ({ context }) => {
    const c = context.teamContext;
    if (!canManageTeam(c.activeTeam.membershipRole, c.user.systemRole))
      throw notFound();
  },
  head: ({ match }) => ({
    meta: [
      {
        title:
          match.context.messages.teamManagement.notifications.emailPreviewPage
            .title,
      },
    ],
  }),
  component: Page,
});
function Page() {
  const { locale, messages } = Route.useRouteContext();
  return <NotificationEmailPreviewClient locale={locale} messages={messages} />;
}
