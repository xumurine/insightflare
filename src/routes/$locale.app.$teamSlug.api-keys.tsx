import { createFileRoute, notFound } from "@tanstack/react-router";

import { ApiKeysClient } from "@/components/dashboard/api-keys-client";
import { PageHeading } from "@/components/dashboard/page-heading";
import { canManageTeam } from "@/lib/dashboard/permissions";
import { dashboardPageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/$locale/app/$teamSlug/api-keys")({
  beforeLoad: ({ context }) => {
    const c = context.teamContext;
    if (!canManageTeam(c.activeTeam.membershipRole, c.user.systemRole))
      throw notFound();
  },
  head: ({ match }) => ({
    meta: [
      {
        title: dashboardPageTitle(
          match.context.messages.teamManagement.apiKeys.title,
          match.context,
        ),
      },
    ],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, teamContext: c } = Route.useRouteContext();
  const copy = messages.teamManagement.apiKeys;
  return (
    <div className="space-y-4">
      <PageHeading title={copy.title} subtitle={copy.subtitle} />
      <ApiKeysClient
        locale={locale}
        messages={messages}
        teamId={c.activeTeam.id}
        sites={c.sites.map((site) => ({
          id: site.id,
          name: site.name,
          domain: site.domain,
        }))}
      />
    </div>
  );
}
