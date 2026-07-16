import { createFileRoute, notFound } from "@tanstack/react-router";

import { PageDetailClientPage } from "@/components/dashboard/site-pages/page-detail-client-page";
import {
  normalizePagePath,
  PAGE_DETAIL_QUERY_PARAM,
} from "@/lib/dashboard/page-detail";
import { buildSitePath } from "@/lib/dashboard/paths";
import { dashboardPageTitle } from "@/lib/page-title";

export const Route = createFileRoute(
  "/$locale/app/$teamSlug/$siteSlug/pages_/$pageKey",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    pagePath: typeof search.pagePath === "string" ? search.pagePath : undefined,
  }),
  head: ({ match }) => ({
    meta: [
      {
        title: dashboardPageTitle(
          normalizePagePath(match.search[PAGE_DETAIL_QUERY_PARAM]) ||
            match.context.messages.pages.title,
          match.context,
        ),
      },
    ],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  const pagePath = normalizePagePath(
    Route.useSearch()[PAGE_DETAIL_QUERY_PARAM],
  );
  if (!pagePath) throw notFound();
  return (
    <PageDetailClientPage
      locale={locale}
      messages={messages}
      siteId={c.activeSite.id}
      siteDomain={c.activeSite.domain}
      pathname={buildSitePath(locale, c.activeTeam.slug, c.activeSite.slug)}
      pagePath={pagePath}
    />
  );
}
