import { notFound } from "next/navigation";

import { PerformanceClientPageIsland } from "@/components/dashboard/site-pages/performance-client-page-island";
import { getTeamSiteContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface PerformancePageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
}

export async function generateMetadata({ params }: PerformancePageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.performance.title,
  };
}

export default async function PerformancePage({
  params,
}: PerformancePageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  return (
    <PerformanceClientPageIsland
      locale={resolvedLocale}
      messages={messages}
      siteId={context.activeSite.id}
    />
  );
}
