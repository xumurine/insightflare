import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { APP_NAME } from "@/lib/constants";
import { canManageTeam } from "@/lib/dashboard/permissions";
import { getDashboardTeamContext } from "@/lib/dashboard/server";
import {
  buildManagementSections,
  buildTeamSections,
} from "@/lib/dashboard/team-sections";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

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
  const { locale, teamSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const context = await getDashboardTeamContext(teamSlug);

  if (!context) {
    notFound();
  }
  const pathname = `/${resolvedLocale}/app/${context.activeTeam.slug}`;

  return (
    <DashboardShell
      locale={resolvedLocale}
      pathname={pathname}
      messages={messages}
      user={context.user}
      teams={context.teams}
      activeTeamSlug={context.activeTeam.slug}
      sites={context.sites}
      unreadAttentionCount={context.unreadAttentionCount}
      teamSections={buildTeamSections(
        resolvedLocale,
        context.activeTeam.slug,
        messages,
        canManageTeam(
          context.activeTeam.membershipRole,
          context.user.systemRole,
        ),
      )}
      managementSections={
        context.user.systemRole === "admin"
          ? buildManagementSections(resolvedLocale, messages)
          : undefined
      }
    >
      {children}
    </DashboardShell>
  );
}
