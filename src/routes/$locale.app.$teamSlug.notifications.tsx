import { RiNotification3Line } from "@remixicon/react";
import { createFileRoute } from "@tanstack/react-router";

import { TeamNotificationsClient } from "@/components/dashboard/team-notifications-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canManageTeam } from "@/lib/dashboard/permissions";

export const Route = createFileRoute("/$locale/app/$teamSlug/notifications")({
  head: ({ match }) => ({
    meta: [
      { title: match.context.messages.teamManagement.notifications.title },
    ],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, teamContext: c } = Route.useRouteContext();
  if (!canManageTeam(c.activeTeam.membershipRole, c.user.systemRole)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <RiNotification3Line className="size-4" />
            {messages.teamManagement.notifications.forbiddenTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="max-w-prose text-sm leading-6 text-muted-foreground">
            {messages.teamManagement.notifications.forbiddenDescription}
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <TeamNotificationsClient
      locale={locale}
      messages={messages}
      teamId={c.activeTeam.id}
      teamSlug={c.activeTeam.slug}
      currentUserId={c.user.id}
    />
  );
}
