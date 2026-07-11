import { ShareTrendCard } from "@/components/dashboard/share-trend-card";
import { fetchPagesShareTrend } from "@/lib/dashboard/client-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface PagesShareTrendCardProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  window: TimeWindow;
  filters: DashboardFilters;
}

export function PagesShareTrendCard({
  locale,
  messages,
  siteId,
  window,
  filters,
}: PagesShareTrendCardProps) {
  return (
    <ShareTrendCard
      locale={locale}
      messages={messages}
      siteId={siteId}
      window={window}
      filters={filters}
      title={messages.pages.trendTitle}
      fetchTrend={fetchPagesShareTrend}
      limit={5}
      otherLabel={messages.pages.otherPages}
    />
  );
}
