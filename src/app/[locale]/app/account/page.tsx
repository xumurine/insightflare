import { notFound } from "next/navigation";

import { AccountSettingsClient } from "@/components/dashboard/account-settings-client";
import { RootDashboardShell } from "@/components/dashboard/root-dashboard-shell";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface AccountSettingsPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: AccountSettingsPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.accountSettings.title,
  };
}

export default async function AccountSettingsPage({
  params,
}: AccountSettingsPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const profile = await getDashboardProfile();

  if (!profile) {
    notFound();
  }

  return (
    <RootDashboardShell
      locale={resolvedLocale}
      messages={messages}
      pathname={`/${resolvedLocale}/app/account`}
    >
      <AccountSettingsClient
        locale={resolvedLocale}
        messages={messages}
        user={profile.user}
      />
    </RootDashboardShell>
  );
}
