import { RiNotification3Line } from "@remixicon/react";

import { TeamNotificationsClient } from "@/components/dashboard/team-notifications-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canManageTeam } from "@/lib/dashboard/permissions";
import { getDashboardTeamContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface TeamNotificationsPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export async function generateMetadata({ params }: TeamNotificationsPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.teamManagement.notifications.title,
  };
}

export default async function TeamNotificationsPage({
  params,
}: TeamNotificationsPageProps) {
  const { locale, teamSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const context = await getDashboardTeamContext(teamSlug);

  if (!context) return null;

  if (
    !canManageTeam(context.activeTeam.membershipRole, context.user.systemRole)
  ) {
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
      locale={resolvedLocale}
      messages={messages}
      teamId={context.activeTeam.id}
      teamSlug={teamSlug}
      currentUserId={context.user.id}
    />
  );
}
