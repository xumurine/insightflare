import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { APP_NAME } from "@/lib/constants";
import { getDashboardTeamContext } from "@/lib/dashboard/server";

interface TeamLayoutProps {
  children: ReactNode;
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export async function generateMetadata({ params }: TeamLayoutProps) {
  const { teamSlug } = await params;
  const context = await getDashboardTeamContext(teamSlug);

  if (!context) {
    return {
      title: APP_NAME,
    };
  }

  return {
    title: {
      default: context.activeTeam.name,
      template: `%s · ${context.activeTeam.name} - ${APP_NAME}`,
    },
  };
}

export default async function TeamLayout({
  children,
  params,
}: TeamLayoutProps) {
  const { teamSlug } = await params;
  const context = await getDashboardTeamContext(teamSlug);

  if (!context) {
    notFound();
  }

  return <>{children}</>;
}
