import { notFound } from "next/navigation";

import { NotificationEmailPreviewClient } from "@/components/dashboard/notification-email-preview-client";
import { canManageTeam } from "@/lib/dashboard/permissions";
import { getDashboardTeamContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface NotificationEmailPreviewPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export async function generateMetadata({
  params,
}: NotificationEmailPreviewPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.teamManagement.notifications.emailPreviewPage.title,
  };
}

export default async function NotificationEmailPreviewPage({
  params,
}: NotificationEmailPreviewPageProps) {
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

  return (
    <NotificationEmailPreviewClient
      locale={resolvedLocale}
      messages={messages}
    />
  );
}
