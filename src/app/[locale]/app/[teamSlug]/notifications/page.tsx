import { notFound } from "next/navigation";
import { RiNotification3Line } from "@remixicon/react";

import { PageHeading } from "@/components/dashboard/page-heading";
import { Card, CardContent } from "@/components/ui/card";
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

export default async function TeamNotificationsPage({
  params,
}: TeamNotificationsPageProps) {
  const { locale, teamSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const context = await getDashboardTeamContext(teamSlug);

  if (
    !context ||
    !canManageTeam(context.activeTeam.membershipRole, context.user.systemRole)
  ) {
    notFound();
  }

  const copy = messages.teamManagement.notifications;

  return (
    <div className="space-y-4">
      <PageHeading title={copy.title} subtitle={copy.subtitle} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
          <RiNotification3Line className="size-8 text-muted-foreground/70" />
          <p>{copy.empty}</p>
        </CardContent>
      </Card>
    </div>
  );
}
