import { notFound } from "next/navigation";

import { RootDashboardShell } from "@/components/dashboard/root-dashboard-shell";
import { NotificationEmailSettingsClient } from "@/components/dashboard/system-settings/notification-email-settings-client";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface SystemSettingsPageProps {
  params: Promise<{
    locale: string;
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
      pathname={`/${resolvedLocale}/app/manage/system-settings`}
    >
      <NotificationEmailSettingsClient
        locale={resolvedLocale}
        messages={messages}
        currentUserEmail={profile.user.email}
      />
    </RootDashboardShell>
  );
}
