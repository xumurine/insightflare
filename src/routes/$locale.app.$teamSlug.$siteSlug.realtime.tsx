import { createFileRoute } from "@tanstack/react-router";

import { RealtimeClientPage } from "@/components/dashboard/site-pages/realtime-client-page";

export const Route = createFileRoute(
  "/$locale/app/$teamSlug/$siteSlug/realtime",
)({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.realtime.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  return (
    <RealtimeClientPage
      locale={locale}
      messages={messages}
      siteId={c.activeSite.id}
      siteDomain={c.activeSite.domain}
    />
  );
}
