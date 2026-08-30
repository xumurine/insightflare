import { APP_NAME } from "@/lib/constants";

type DashboardTitleContext = {
  [key: string]: unknown;
  siteContext?: {
    activeSite: { name: string };
    activeTeam: { name: string };
  };
  teamContext?: {
    activeTeam: { name: string };
  };
};

/**
 * Reproduces the nested metadata templates used by the former Next.js app.
 */
export function dashboardPageTitle(
  pageTitle: string,
  context: DashboardTitleContext,
): string {
  if (context.siteContext) {
    const { activeSite, activeTeam } = context.siteContext;
    return `${pageTitle} · ${activeSite.name} · ${activeTeam.name} - ${APP_NAME}`;
  }

  if (context.teamContext) {
    return `${pageTitle} · ${context.teamContext.activeTeam.name} - ${APP_NAME}`;
  }

  return `${pageTitle} - ${APP_NAME}`;
}
