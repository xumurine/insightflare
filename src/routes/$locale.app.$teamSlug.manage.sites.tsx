import { createFileRoute, notFound } from "@tanstack/react-router";

import { AdminSitesManagementClient } from "@/components/dashboard/admin-sites-management-client";
import { canManageTeam } from "@/lib/dashboard/permissions";

export const Route = createFileRoute("/$locale/app/$teamSlug/manage/sites")({
  beforeLoad: ({ context }) => {
    const c = context.teamContext;
    if (!canManageTeam(c.activeTeam.membershipRole, c.user.systemRole))
      throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.adminSites.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages, teamContext: c } = Route.useRouteContext();
  return (
    <AdminSitesManagementClient
      locale={locale}
      messages={messages}
      activeTeam={c.activeTeam}
    />
  );
}
