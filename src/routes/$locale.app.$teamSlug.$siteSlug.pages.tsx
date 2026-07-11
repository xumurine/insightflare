import { createFileRoute } from "@tanstack/react-router";

import { PagesClientPage } from "@/components/dashboard/site-pages/pages-client-page";
import { buildSitePath } from "@/lib/dashboard/paths";

export const Route = createFileRoute("/$locale/app/$teamSlug/$siteSlug/pages")({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.pages.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  return (
    <PagesClientPage
      locale={locale}
      messages={messages}
      siteId={c.activeSite.id}
      pathname={buildSitePath(
        locale,
        c.activeTeam.slug,
        c.activeSite.slug,
        "pages",
      )}
    />
  );
}
