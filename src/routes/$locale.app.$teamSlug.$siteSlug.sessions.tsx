import { createFileRoute } from "@tanstack/react-router";

import { SessionsClientPage } from "@/components/dashboard/site-pages/sessions-client-page";
import { buildSitePath } from "@/lib/dashboard/paths";

export const Route = createFileRoute(
  "/$locale/app/$teamSlug/$siteSlug/sessions",
)({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.sessions.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  return (
    <SessionsClientPage
      locale={locale}
      messages={messages}
      siteId={c.activeSite.id}
      pathname={buildSitePath(
        locale,
        c.activeTeam.slug,
        c.activeSite.slug,
        "sessions",
      )}
    />
  );
}
