import { notFound } from "next/navigation";

import { VisitorDetailClientPage } from "@/components/dashboard/site-pages/visitor-detail-client-page";
import { buildSitePath, getTeamSiteContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface VisitorDetailPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
}

export default async function VisitorDetailPage({
  params,
}: VisitorDetailPageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  const pathname = `${buildSitePath(
    resolvedLocale,
    context.activeTeam.slug,
    context.activeSite.slug,
    "visitors",
  )}/detail`;

  return (
    <VisitorDetailClientPage
      locale={resolvedLocale}
      messages={messages}
      siteId={context.activeSite.id}
      pathname={pathname}
    />
  );
}
