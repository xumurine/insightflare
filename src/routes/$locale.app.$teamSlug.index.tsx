import { createFileRoute } from "@tanstack/react-router";

import { TeamManagementClient } from "@/components/dashboard/team-management-client";

export const Route = createFileRoute("/$locale/app/$teamSlug/")({
  component: TeamIndexPage,
});

function TeamIndexPage() {
  const { locale, messages, teamContext } = Route.useRouteContext();
  return (
    <TeamManagementClient
      locale={locale}
      messages={messages}
      activeTeam={teamContext.activeTeam}
      activeTab="sites"
      systemRole={teamContext.user.systemRole}
      currentUserId={teamContext.user.id}
    />
  );
}
