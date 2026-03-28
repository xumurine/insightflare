"use client";

import { useEffect, useState } from "react";
import { ContentSwitch } from "@/components/dashboard/content-switch";
import { ShareRadialCard } from "@/components/dashboard/share-radial-card";
import {
  fetchBrowserTrend,
  fetchBrowserEngineTrend,
} from "@/lib/dashboard/client-data";
import type { BrowserTrendData } from "@/lib/edge-client";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

function emptyTrend(): BrowserTrendData {
  return { ok: true, interval: "day", series: [], data: [] };
}

interface BrowserShareOverviewProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  window: TimeWindow;
  filters: DashboardFilters;
}

export function BrowserShareOverview({
  locale,
  messages,
  siteId,
  window: tw,
  filters,
}: BrowserShareOverviewProps) {
  const [browserTrend, setBrowserTrend] =
    useState<BrowserTrendData>(emptyTrend);
  const [engineTrend, setEngineTrend] = useState<BrowserTrendData>(emptyTrend);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      fetchBrowserTrend(siteId, tw, filters, { limit: 5 }).catch(() =>
        emptyTrend(),
      ),
      fetchBrowserEngineTrend(siteId, tw, filters, { limit: 5 }).catch(() =>
        emptyTrend(),
      ),
    ]).then(([bt, et]) => {
      if (!active) return;
      setBrowserTrend(bt);
      setEngineTrend(et);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [siteId, tw.from, tw.to, filters]);

  const hasContent =
    browserTrend.series.length > 0 || engineTrend.series.length > 0;

  return (
    <ContentSwitch
      loading={loading}
      hasContent={hasContent}
      loadingLabel={messages.common.loading}
      emptyContent={<p>{messages.common.noData}</p>}
      minHeightClassName="min-h-[200px]"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <ShareRadialCard
          title={messages.browsers.browserShareTitle}
          items={browserTrend.series.map((item) => ({
            key: item.key,
            label: item.label,
            value: item.visitors,
            isOther: item.isOther,
          }))}
          locale={locale}
          valueLabel={messages.common.visitors}
        />
        <ShareRadialCard
          title={messages.browsers.engineShareTitle}
          items={engineTrend.series.map((item) => ({
            key: item.key,
            label: item.label,
            value: item.visitors,
            isOther: item.isOther,
          }))}
          locale={locale}
          valueLabel={messages.common.visitors}
        />
      </div>
    </ContentSwitch>
  );
}
