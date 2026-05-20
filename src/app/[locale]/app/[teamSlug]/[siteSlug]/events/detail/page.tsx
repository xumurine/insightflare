import { notFound } from "next/navigation";

import { EventTypeDetailClientPage } from "@/components/dashboard/site-pages/event-type-detail-client-page";
import { buildSitePath, getTeamSiteContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface EventTypeDetailPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
  searchParams: Promise<{
    eventName?: string;
  }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: EventTypeDetailPageProps) {
  const { locale } = await params;
  const search = await searchParams;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const eventName = search.eventName?.trim();

  return {
    title: eventName || messages.events.detailTitle,
  };
}

export default async function EventTypeDetailPage({
  params,
}: EventTypeDetailPageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  const pathname = `${buildSitePath(
    resolvedLocale,
    context.activeTeam.slug,
    context.activeSite.slug,
    "events",
  )}/detail`;

  return (
    <EventTypeDetailClientPage
      locale={resolvedLocale}
      messages={messages}
      siteId={context.activeSite.id}
      siteDomain={context.activeSite.domain}
      pathname={pathname}
    />
  );
}
