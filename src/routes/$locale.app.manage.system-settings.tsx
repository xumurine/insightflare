import { createFileRoute, notFound } from "@tanstack/react-router";

import { PageHeading } from "@/components/dashboard/page-heading";
import { BotAnalyticsSettingsClient } from "@/components/dashboard/system-settings/bot-analytics-settings-client";
import { LoginTurnstileSettingsClient } from "@/components/dashboard/system-settings/login-turnstile-settings-client";
import { NotificationEmailSettingsClient } from "@/components/dashboard/system-settings/notification-email-settings-client";
export const Route = createFileRoute("/$locale/app/manage/system-settings")({
  beforeLoad: ({ context }) => {
    if (context.dashboardRoot?.user.systemRole !== "admin") throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.systemSettings.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, dashboardRoot } = Route.useRouteContext();
  if (!dashboardRoot) throw notFound();
  return (
    <div className="space-y-4">
      <PageHeading
        title={messages.systemSettings.title}
        subtitle={messages.systemSettings.subtitle}
      />
      <BotAnalyticsSettingsClient messages={messages} />
      <LoginTurnstileSettingsClient messages={messages} />
      <NotificationEmailSettingsClient
        locale={locale}
        messages={messages}
        currentUserEmail={dashboardRoot.user.email}
        showHeading={false}
      />
    </div>
  );
}
