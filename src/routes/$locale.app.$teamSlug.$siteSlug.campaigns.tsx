import { createFileRoute } from "@tanstack/react-router";

import { CampaignsClientPage } from "@/components/dashboard/site-pages/campaigns-client-page";
import { buildSitePath } from "@/lib/dashboard/paths";

export const Route = createFileRoute(
  "/$locale/app/$teamSlug/$siteSlug/campaigns",
)({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.campaigns.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  return (
    <CampaignsClientPage
      locale={locale}
      messages={messages}
      siteId={c.activeSite.id}
      pathname={buildSitePath(
        locale,
        c.activeTeam.slug,
        c.activeSite.slug,
        "campaigns",
      )}
    />
  );
}
