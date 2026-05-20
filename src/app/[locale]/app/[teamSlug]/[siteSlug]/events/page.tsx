import { notFound } from "next/navigation";

import { EventsClientPage } from "@/components/dashboard/site-pages/events-client-page";
import { buildSitePath, getTeamSiteContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface EventsPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
}

export async function generateMetadata({ params }: EventsPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.events.title,
  };
}

export default async function EventsPage({ params }: EventsPageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  const pathname = buildSitePath(
    resolvedLocale,
    context.activeTeam.slug,
    context.activeSite.slug,
    "events",
  );

  return (
    <EventsClientPage
      locale={resolvedLocale}
      messages={messages}
      siteId={context.activeSite.id}
      siteDomain={context.activeSite.domain}
      pathname={pathname}
    />
  );
}
