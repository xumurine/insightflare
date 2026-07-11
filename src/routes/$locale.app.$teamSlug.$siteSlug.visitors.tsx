import { createFileRoute } from "@tanstack/react-router";

import { VisitorsClientPage } from "@/components/dashboard/site-pages/visitors-client-page";
import { buildSitePath } from "@/lib/dashboard/paths";

export const Route = createFileRoute(
  "/$locale/app/$teamSlug/$siteSlug/visitors",
)({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.visitors.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  return (
    <VisitorsClientPage
      locale={locale}
      messages={messages}
      siteId={c.activeSite.id}
      pathname={buildSitePath(
        locale,
        c.activeTeam.slug,
        c.activeSite.slug,
        "visitors",
      )}
    />
  );
}
