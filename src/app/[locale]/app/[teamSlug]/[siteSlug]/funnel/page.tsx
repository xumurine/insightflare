import { notFound } from "next/navigation";

import { FunnelsClientPage } from "@/components/dashboard/site-pages/funnels-client-page";
import { buildSitePath, getTeamSiteContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface FunnelPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
}

export async function generateMetadata({ params }: FunnelPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.funnels.title,
  };
}

export default async function FunnelPage({ params }: FunnelPageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  const pathname = buildSitePath(
    resolvedLocale,
    context.activeTeam.slug,
    context.activeSite.slug,
    "funnel",
  );

  return (
    <FunnelsClientPage
      locale={resolvedLocale}
      messages={messages}
      siteId={context.activeSite.id}
      pathname={pathname}
    />
  );
}
