import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDashboardRootContext } from "@/lib/dashboard/server";
import { buildManagementSections } from "@/lib/dashboard/team-sections";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface RootDashboardShellProps {
  children: ReactNode;
  locale: Locale;
  messages: AppMessages;
  pathname: string;
}

export async function RootDashboardShell({
  children,
  locale,
  messages,
  pathname,
}: RootDashboardShellProps) {
  const context = await getDashboardRootContext();

  if (!context) {
    return <>{children}</>;
  }

  return (
    <DashboardShell
      locale={locale}
      pathname={pathname}
      messages={messages}
      user={context.user}
      teams={context.teams}
      unreadAttentionCount={context.unreadAttentionCount}
      managementSections={
        context.user.systemRole === "admin"
          ? buildManagementSections(locale, messages)
          : undefined
      }
    >
      {children}
    </DashboardShell>
  );
}
