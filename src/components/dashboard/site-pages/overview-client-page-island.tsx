"use client";

import dynamic from "next/dynamic";

import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface OverviewClientPageIslandProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  siteDomain: string;
  pathname: string;
}

const OverviewClientPageClient = dynamic<OverviewClientPageIslandProps>(
  () =>
    import("@/components/dashboard/site-pages/overview-client-page").then(
      (module) => module.OverviewClientPage,
    ),
  {
    ssr: false,
    loading: () => <DashboardPageIslandLoading />,
  },
);

function DashboardPageIslandLoading() {
  return (
    <div className="flex min-h-[24rem] items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
    </div>
  );
}

export function OverviewClientPageIsland(props: OverviewClientPageIslandProps) {
  return <OverviewClientPageClient {...props} />;
}
