import { createFileRoute } from "@tanstack/react-router";

import { OverviewClientPage } from "@/components/dashboard/site-pages/overview-client-page";
import { sharePath } from "@/lib/dashboard/share-path";
export const Route = createFileRoute("/$locale/share/$slug/")({
  head: ({ match }) => ({
    meta: [{ title: match.context.shareContext.site.name }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, shareContext: c } = Route.useRouteContext();
  const { slug } = Route.useParams();
  return (
    <OverviewClientPage
      locale={locale}
      messages={messages}
      siteId={c.publicSiteId}
      siteDomain={c.site.domain}
      pathname={sharePath(locale, slug)}
    />
  );
}
