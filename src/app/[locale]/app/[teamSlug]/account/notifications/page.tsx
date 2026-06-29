import { notFound } from "next/navigation";

import { NotificationCenterClient } from "@/components/dashboard/notification-center-client";
import { getDashboardTeamContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface AccountNotificationsPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export async function generateMetadata({
  params,
}: AccountNotificationsPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.notificationCenter.title,
  };
}

export default async function AccountNotificationsPage({
  params,
}: AccountNotificationsPageProps) {
  const { locale, teamSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const context = await getDashboardTeamContext(teamSlug);

  if (!context) {
    notFound();
  }

  return (
    <NotificationCenterClient
      locale={resolvedLocale}
      messages={messages}
      teamId={context.activeTeam.id}
    />
  );
}
