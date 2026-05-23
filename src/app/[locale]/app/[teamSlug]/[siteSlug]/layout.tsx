import type { ReactNode } from "react";

import { APP_NAME } from "@/lib/constants";
import { getTeamSiteContext } from "@/lib/dashboard/server";

interface SiteLayoutProps {
  children: ReactNode;
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
}

export async function generateMetadata({ params }: SiteLayoutProps) {
  const { teamSlug, siteSlug } = await params;
  const context = await getTeamSiteContext(teamSlug, siteSlug);

  if (!context) {
    return {
      title: APP_NAME,
    };
  }

  return {
    title: {
      default: context.activeSite.name,
      template: `%s · ${context.activeSite.name} · ${context.activeTeam.name} - ${APP_NAME}`,
    },
  };
}

export default function SiteLayout({ children }: SiteLayoutProps) {
  return children;
}
