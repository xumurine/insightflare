import { notFound } from "next/navigation";

import { SystemPerformanceClient } from "@/components/dashboard/system-performance-client";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface SystemPerformancePageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export default async function SystemPerformancePage({
  params,
}: SystemPerformancePageProps) {
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
    <SystemPerformanceClient locale={resolvedLocale} messages={messages} />
  );
}
