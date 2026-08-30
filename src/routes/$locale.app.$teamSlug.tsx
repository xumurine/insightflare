import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";

import { loadDashboardTeam } from "@/lib/dashboard/route-data";

export const Route = createFileRoute("/$locale/app/$teamSlug")({
  beforeLoad: async ({ params }) => {
    const teamContext = await loadDashboardTeam({
      data: { teamSlug: params.teamSlug },
    });
    if (!teamContext) throw notFound();
    return { teamContext };
  },
  head: ({ match }) => {
    const title = match.context.teamContext?.activeTeam?.name;
    return { meta: title ? [{ title }] : [] };
  },
  component: Outlet,
});
