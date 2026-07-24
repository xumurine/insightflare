import { createFileRoute, notFound } from "@tanstack/react-router";

import { AccountSettingsClient } from "@/components/dashboard/account-settings-client";
import { dashboardPageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/$locale/app/account")({
  beforeLoad: ({ context }) => {
    if (!context.dashboardRoot) throw notFound();
  },
  head: ({ match }) => ({
    meta: [
      {
        title: dashboardPageTitle(
          match.context.messages.accountSettings.title,
          match.context,
        ),
      },
    ],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, dashboardRoot } = Route.useRouteContext();
  if (!dashboardRoot) throw notFound();
  return (
    <AccountSettingsClient
      locale={locale}
      messages={messages}
      user={dashboardRoot.user}
    />
  );
}
