import { notFound } from "next/navigation";

import { ScheduledTasksClient } from "@/components/dashboard/scheduled-tasks-client";
import { getDashboardTeamContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface ScheduledTasksPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export async function generateMetadata({ params }: ScheduledTasksPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.managementNav.scheduledTasks,
  };
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

  return <ScheduledTasksClient locale={resolvedLocale} messages={messages} />;
}
