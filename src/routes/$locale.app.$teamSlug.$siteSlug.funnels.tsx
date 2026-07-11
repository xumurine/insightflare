import { createFileRoute } from "@tanstack/react-router";

import { FunnelsClientPage } from "@/components/dashboard/site-pages/funnels-client-page";
import { buildSitePath } from "@/lib/dashboard/paths";

export const Route = createFileRoute(
  "/$locale/app/$teamSlug/$siteSlug/funnels",
)({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.funnels.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  return (
    <FunnelsClientPage
      locale={locale}
      messages={messages}
      siteId={c.activeSite.id}
      pathname={buildSitePath(
        locale,
        c.activeTeam.slug,
        c.activeSite.slug,
        "funnels",
      )}
    />
  );
}
