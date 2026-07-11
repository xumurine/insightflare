import { createFileRoute, notFound } from "@tanstack/react-router";

import { RequestObservationClient } from "@/components/dashboard/request-observation-client";
export const Route = createFileRoute("/$locale/app/manage/request-observation")(
  {
    beforeLoad: ({ context }) => {
      if (context.dashboardRoot?.user.systemRole !== "admin") throw notFound();
    },
    head: ({ match }) => ({
      meta: [{ title: match.context.messages.requestObservation.title }],
    }),
    component: Page,
  },
);
function Page() {
  const { locale, messages } = Route.useRouteContext();
  return <RequestObservationClient locale={locale} messages={messages} />;
}
