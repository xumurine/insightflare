import { createFileRoute, notFound } from "@tanstack/react-router";

import { AccountSettingsClient } from "@/components/dashboard/account-settings-client";

export const Route = createFileRoute("/$locale/app/account")({
  beforeLoad: ({ context }) => {
    if (!context.dashboardRoot) throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.accountSettings.title }],
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
