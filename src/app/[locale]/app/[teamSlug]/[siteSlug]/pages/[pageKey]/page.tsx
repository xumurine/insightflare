import { notFound } from "next/navigation";
import { PageDetailClientPage } from "@/components/dashboard/site-pages/page-detail-client-page";
import { getTeamSiteContext } from "@/lib/dashboard/server";
import {
  PAGE_DETAIL_QUERY_PARAM,
  normalizePagePath,
} from "@/lib/dashboard/page-detail";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface PageDetailPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
  searchParams: Promise<{
    pagePath?: string;
  }>;
}

export default async function PageDetailPage({
  params,
  searchParams,
}: PageDetailPageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const search = await searchParams;
  const pagePath = normalizePagePath(search[PAGE_DETAIL_QUERY_PARAM]);

  if (!pagePath) notFound();

  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  return (
    <PageDetailClientPage
      locale={resolvedLocale}
      messages={messages}
      siteId={context.activeSite.id}
      pagePath={pagePath}
    />
  );
}
