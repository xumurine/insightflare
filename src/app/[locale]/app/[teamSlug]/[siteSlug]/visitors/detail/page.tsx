import { notFound, redirect } from "next/navigation";

import { buildSitePath, getTeamSiteContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface VisitorDetailPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
  searchParams: Promise<{
    visitorId?: string;
  }>;
}

export async function generateMetadata({ params }: VisitorDetailPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.visitors.title,
  };
}

export default async function VisitorDetailPage({
  params,
  searchParams,
}: VisitorDetailPageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const search = await searchParams;

  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  const visitorsPath = buildSitePath(
    resolvedLocale,
    context.activeTeam.slug,
    context.activeSite.slug,
    "visitors",
  );
  const visitorId = search.visitorId?.trim();

  redirect(
    visitorId
      ? `${visitorsPath}?detail=${encodeURIComponent(visitorId)}`
      : visitorsPath,
  );
}
