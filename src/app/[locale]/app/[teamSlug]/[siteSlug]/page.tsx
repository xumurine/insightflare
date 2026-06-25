import { notFound } from "next/navigation";

import { OverviewClientPageIsland } from "@/components/dashboard/site-pages/overview-client-page-island";
import { buildSitePath, getTeamSiteContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface OverviewPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
}

export async function generateMetadata({ params }: OverviewPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.overview.title,
  };
}

export default async function OverviewPage({ params }: OverviewPageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  const pathname = buildSitePath(
    resolvedLocale,
    context.activeTeam.slug,
    context.activeSite.slug,
  );

  return (
    <OverviewClientPageIsland
      locale={resolvedLocale}
      messages={messages}
      siteId={context.activeSite.id}
      siteDomain={context.activeSite.domain}
      pathname={pathname}
    />
  );
}
