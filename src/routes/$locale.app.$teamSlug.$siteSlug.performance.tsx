import { createFileRoute } from "@tanstack/react-router";

import { PerformanceClientPage } from "@/components/dashboard/site-pages/performance-client-page";

export const Route = createFileRoute(
  "/$locale/app/$teamSlug/$siteSlug/performance",
)({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.performance.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  return (
    <PerformanceClientPage
      locale={locale}
      messages={messages}
      siteId={c.activeSite.id}
    />
  );
}
