import { notFound, redirect } from "next/navigation";

import { buildSitePath, getTeamSiteContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface SessionDetailPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
  searchParams: Promise<{
    sessionId?: string;
  }>;
}

export async function generateMetadata({ params }: SessionDetailPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.sessions.title,
  };
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: SessionDetailPageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const search = await searchParams;

  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  const sessionsPath = buildSitePath(
    resolvedLocale,
    context.activeTeam.slug,
    context.activeSite.slug,
    "sessions",
  );
  const sessionId = search.sessionId?.trim();

  redirect(
    sessionId
      ? `${sessionsPath}?detail=${encodeURIComponent(sessionId)}`
      : sessionsPath,
  );
}
