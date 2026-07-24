import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";

import { loadDashboardSite } from "@/lib/dashboard/route-data";

export const Route = createFileRoute("/$locale/app/$teamSlug/$siteSlug")({
  beforeLoad: async ({ params }) => {
    const siteContext = await loadDashboardSite({
      data: { teamSlug: params.teamSlug, siteSlug: params.siteSlug },
    });
    if (!siteContext) throw notFound();
    return { siteContext };
  },
  head: ({ match }) => ({
    meta: [{ title: match.context.siteContext.activeSite.name }],
  }),
  component: Outlet,
});
