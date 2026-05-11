import { notFound } from "next/navigation";
import { RiCalendarScheduleLine } from "@remixicon/react";

import { PageHeading } from "@/components/dashboard/page-heading";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardTeamContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface ScheduledTasksPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export default async function ScheduledTasksPage({
  params,
}: ScheduledTasksPageProps) {
  const { locale, teamSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const context = await getDashboardTeamContext(teamSlug);

  if (!context || context.user.systemRole !== "admin") {
    notFound();
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title={messages.managementNav.scheduledTasks}
        subtitle={messages.managementPages.scheduledTasks.subtitle}
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
          <RiCalendarScheduleLine className="size-8 text-muted-foreground/70" />
          <p>{messages.managementPages.scheduledTasks.empty}</p>
        </CardContent>
      </Card>
    </div>
  );
}
