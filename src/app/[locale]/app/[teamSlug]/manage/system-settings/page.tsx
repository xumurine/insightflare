import { notFound } from "next/navigation";

import { NotificationEmailSettingsClient } from "@/components/dashboard/system-settings/notification-email-settings-client";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface SystemSettingsPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export async function generateMetadata({ params }: SystemSettingsPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.systemSettings.title,
  };
}

export default async function SystemSettingsPage({
  params,
}: SystemSettingsPageProps) {
  const { locale, teamSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const profile = await getDashboardProfile();

  if (!profile || profile.user.systemRole !== "admin") {
    notFound();
  }

  const activeTeam = profile.teams.find((team) => team.slug === teamSlug);
  if (!activeTeam) {
    notFound();
  }

  return (
    <NotificationEmailSettingsClient
      locale={resolvedLocale}
      messages={messages}
      currentUserEmail={profile.user.email}
    />
  );
}
