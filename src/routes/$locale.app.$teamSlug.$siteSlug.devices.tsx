import { createFileRoute } from "@tanstack/react-router";

import { DevicesClientPage } from "@/components/dashboard/site-pages/devices-client-page";
import { buildSitePath } from "@/lib/dashboard/paths";

export const Route = createFileRoute(
  "/$locale/app/$teamSlug/$siteSlug/devices",
)({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.devices.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  return (
    <DevicesClientPage
      locale={locale}
      messages={messages}
      siteId={c.activeSite.id}
      siteDomain={c.activeSite.domain}
      pathname={buildSitePath(
        locale,
        c.activeTeam.slug,
        c.activeSite.slug,
        "devices",
      )}
    />
  );
}
