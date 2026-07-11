import { createFileRoute } from "@tanstack/react-router";

import { OverviewClientPage } from "@/components/dashboard/site-pages/overview-client-page";
import { buildSitePath } from "@/lib/dashboard/paths";

export const Route = createFileRoute("/$locale/app/$teamSlug/$siteSlug/")({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.overview.title }],
  }),
  component: SiteOverviewPage,
});

function SiteOverviewPage() {
  const { locale, messages, siteContext } = Route.useRouteContext();
  return (
    <OverviewClientPage
      locale={locale}
      messages={messages}
      siteId={siteContext.activeSite.id}
      siteDomain={siteContext.activeSite.domain}
      pathname={buildSitePath(
        locale,
        siteContext.activeTeam.slug,
        siteContext.activeSite.slug,
      )}
    />
  );
}
