"use client";

import dynamic from "next/dynamic";

import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface PerformanceClientPageIslandProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
}

const PerformanceClientPageClient = dynamic<PerformanceClientPageIslandProps>(
  () =>
    import("@/components/dashboard/site-pages/performance-client-page").then(
      (module) => module.PerformanceClientPage,
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

export function PerformanceClientPageIsland(
  props: PerformanceClientPageIslandProps,
) {
  return <PerformanceClientPageClient {...props} />;
}
