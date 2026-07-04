import type { ReactNode } from "react";

import { RootDashboardShell } from "@/components/dashboard/root-dashboard-shell";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface AppLayoutProps {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export default async function AppLayout({ children, params }: AppLayoutProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return (
    <RootDashboardShell
      locale={resolvedLocale}
      messages={messages}
      pathname={`/${resolvedLocale}/app`}
    >
      {children}
    </RootDashboardShell>
  );
}
