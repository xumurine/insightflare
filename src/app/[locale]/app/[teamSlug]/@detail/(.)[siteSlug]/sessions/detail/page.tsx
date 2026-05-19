import { notFound } from "next/navigation";

import { InterceptedDetailModal } from "@/components/dashboard/site-pages/intercepted-detail-modal";
import { SessionDetailClientPage } from "@/components/dashboard/site-pages/session-detail-client-page";
import { buildSitePath, getTeamSiteContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface InterceptedSessionDetailPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
}

export default async function InterceptedSessionDetailPage({
  params,
}: InterceptedSessionDetailPageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  const pathname = `${buildSitePath(
    resolvedLocale,
    context.activeTeam.slug,
    context.activeSite.slug,
    "sessions",
  )}/detail`;

  return (
    <InterceptedDetailModal
      ariaLabel={resolvedLocale === "zh" ? "会话详情" : "Session detail"}
    >
      <SessionDetailClientPage
        locale={resolvedLocale}
        messages={messages}
        siteId={context.activeSite.id}
        pathname={pathname}
      />
    </InterceptedDetailModal>
  );
}
