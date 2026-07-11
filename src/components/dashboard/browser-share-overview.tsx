import { useEffect, useState } from "react";

import { ShareRadialCard } from "@/components/dashboard/share-radial-card";
import { AutoTransition } from "@/components/ui/auto-transition";
import { Spinner } from "@/components/ui/spinner";
import {
  fetchBrowserEngineTrend,
  fetchBrowserTrend,
} from "@/lib/dashboard/client-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { BrowserTrendData } from "@/lib/edge-client";
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
  const [hydrated, setHydrated] = useState(false);

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
      setHydrated(true);
    });

    return () => {
      active = false;
    };
  }, [siteId, tw.from, tw.to, filters]);

  const showOverlayLoading = loading && hydrated;
  const showInitialLoading = loading && !hydrated;

  return (
    <div className="relative">
      <div className="grid gap-4">
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
          loading={showInitialLoading}
          emptyLabel={messages.common.noData}
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
          loading={showInitialLoading}
          emptyLabel={messages.common.noData}
        />
      </div>

      <AutoTransition
        type="fade"
        duration={0.22}
        className="pointer-events-none absolute top-2 right-2"
      >
        {showOverlayLoading ? (
          <span
            key="browser-share-overlay-loading"
            className="inline-flex items-center gap-2 rounded-none border border-border/50 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm"
          >
            <Spinner className="size-3.5" />
            {messages.common.loading}
          </span>
        ) : (
          <div
            key="browser-share-overlay-idle"
            className="h-0 w-0 overflow-hidden"
          />
        )}
      </AutoTransition>
    </div>
  );
}
