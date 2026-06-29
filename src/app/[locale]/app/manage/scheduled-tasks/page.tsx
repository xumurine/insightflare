import { notFound } from "next/navigation";

import { RootDashboardShell } from "@/components/dashboard/root-dashboard-shell";
import { ScheduledTasksClient } from "@/components/dashboard/scheduled-tasks-client";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface ScheduledTasksPageProps {
  params: Promise<{
    locale: string;
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
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const profile = await getDashboardProfile();

  if (!profile || profile.user.systemRole !== "admin") {
    notFound();
  }

  return (
    <RootDashboardShell
      locale={resolvedLocale}
      messages={messages}
      pathname={`/${resolvedLocale}/app/manage/scheduled-tasks`}
    >
      <ScheduledTasksClient locale={resolvedLocale} messages={messages} />
    </RootDashboardShell>
  );
}
