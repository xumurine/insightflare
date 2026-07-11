import { createFileRoute } from "@tanstack/react-router";

import { ReferrersClientPage } from "@/components/dashboard/site-pages/referrers-client-page";
import { buildSitePath } from "@/lib/dashboard/paths";

export const Route = createFileRoute(
  "/$locale/app/$teamSlug/$siteSlug/referrers",
)({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.referrers.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  return (
    <ReferrersClientPage
      locale={locale}
      messages={messages}
      siteId={c.activeSite.id}
      pathname={buildSitePath(
        locale,
        c.activeTeam.slug,
        c.activeSite.slug,
        "referrers",
      )}
    />
  );
}
