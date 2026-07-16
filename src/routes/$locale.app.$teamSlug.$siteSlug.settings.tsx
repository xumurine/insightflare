import { createFileRoute } from "@tanstack/react-router";

import { SettingsClientPage } from "@/components/dashboard/site-pages/settings-client-page";
import { dashboardPageTitle } from "@/lib/page-title";

export const Route = createFileRoute(
  "/$locale/app/$teamSlug/$siteSlug/settings",
)({
  head: ({ match }) => ({
    meta: [
      {
        title: dashboardPageTitle(
          match.context.messages.siteSettings.title,
          match.context,
        ),
      },
    ],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, siteContext: c } = Route.useRouteContext();
  return (
    <SettingsClientPage
      locale={locale}
      messages={messages}
      teamSlug={c.activeTeam.slug}
      activeTeamId={c.activeTeam.id}
      siteSlug={c.activeSite.slug}
      teams={c.teams.map((team) => ({
        id: team.id,
        slug: team.slug,
        name: team.name,
      }))}
      site={{
        id: c.activeSite.id,
        name: c.activeSite.name,
        domain: c.activeSite.domain,
        publicEnabled: c.activeSite.publicEnabled,
        publicSlug: c.activeSite.publicSlug,
      }}
    />
  );
}
