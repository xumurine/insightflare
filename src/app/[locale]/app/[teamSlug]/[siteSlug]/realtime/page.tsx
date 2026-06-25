import { notFound } from "next/navigation";

import { RealtimeClientPageIsland } from "@/components/dashboard/site-pages/realtime-client-page-island";
import { getTeamSiteContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface RealtimePageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
}

export async function generateMetadata({ params }: RealtimePageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.realtime.title,
  };
}

export default async function RealtimePage({ params }: RealtimePageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  return (
    <RealtimeClientPageIsland
      locale={resolvedLocale}
      messages={messages}
      siteId={context.activeSite.id}
      siteDomain={context.activeSite.domain}
    />
  );
}
