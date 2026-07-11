import { createFileRoute } from "@tanstack/react-router";

import { BrowsersClientPage } from "@/components/dashboard/site-pages/browsers-client-page";
import { buildSitePath } from "@/lib/dashboard/paths";

export const Route = createFileRoute(
  "/$locale/app/$teamSlug/$siteSlug/browsers",
)({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.browsers.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  return (
    <BrowsersClientPage
      locale={locale}
      messages={messages}
      siteId={c.activeSite.id}
      pathname={buildSitePath(
        locale,
        c.activeTeam.slug,
        c.activeSite.slug,
        "browsers",
      )}
    />
  );
}
