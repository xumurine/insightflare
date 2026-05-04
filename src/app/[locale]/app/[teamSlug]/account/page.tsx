import { notFound } from "next/navigation";

import { AccountSettingsClient } from "@/components/dashboard/account-settings-client";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface AccountSettingsPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export default async function AccountSettingsPage({
  params,
}: AccountSettingsPageProps) {
  const { locale, teamSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const profile = await getDashboardProfile();

  if (!profile) {
    notFound();
  }

  const activeTeam = profile.teams.find((team) => team.slug === teamSlug);
  if (!activeTeam) {
    notFound();
  }

  return <AccountSettingsClient locale={resolvedLocale} messages={messages} />;
}
