import { createFileRoute } from "@tanstack/react-router";

import { GeoClientPage } from "@/components/dashboard/site-pages/geo-client-page";

export const Route = createFileRoute("/$locale/app/$teamSlug/$siteSlug/geo")({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.geo.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  return (
    <GeoClientPage
      locale={locale}
      messages={messages}
      siteId={c.activeSite.id}
    />
  );
}
