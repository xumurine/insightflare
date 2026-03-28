"use client";

import { useEffect, useState } from "react";
import { ContentSwitch } from "@/components/dashboard/content-switch";
import { ShareRadialCard } from "@/components/dashboard/share-radial-card";
import { fetchClientDimensionTrend } from "@/lib/dashboard/client-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { BrowserTrendData } from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

function emptyTrend(): BrowserTrendData {
  return { ok: true, interval: "day", series: [], data: [] };
}

function seriesLabel(
  series: BrowserTrendData["series"][number],
  messages: AppMessages,
): string {
  return series.isOther ? messages.devices.otherLabel : series.label;
}

interface DeviceShareOverviewProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  window: TimeWindow;
  filters: DashboardFilters;
}

export function DeviceShareOverview({
  locale,
  messages,
  siteId,
  window,
  filters,
}: DeviceShareOverviewProps) {
  const [deviceTrend, setDeviceTrend] = useState<BrowserTrendData>(emptyTrend);
  const [osTrend, setOsTrend] = useState<BrowserTrendData>(emptyTrend);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      fetchClientDimensionTrend(siteId, window, "deviceType", filters, {
        limit: 5,
      }).catch(() => emptyTrend()),
      fetchClientDimensionTrend(siteId, window, "operatingSystem", filters, {
        limit: 5,
      }).catch(() => emptyTrend()),
    ])
      .then(([nextDeviceTrend, nextOsTrend]) => {
        if (!active) return;
        setDeviceTrend(nextDeviceTrend);
        setOsTrend(nextOsTrend);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters, siteId, window.from, window.interval, window.to]);

  const hasContent = deviceTrend.series.length > 0 || osTrend.series.length > 0;

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
          title={messages.devices.deviceShareTitle}
          items={deviceTrend.series.map((item) => ({
            key: item.key,
            label: seriesLabel(item, messages),
            value: item.visitors,
            isOther: item.isOther,
          }))}
          locale={locale}
          valueLabel={messages.common.visitors}
        />
        <ShareRadialCard
          title={messages.devices.osShareTitle}
          items={osTrend.series.map((item) => ({
            key: item.key,
            label: seriesLabel(item, messages),
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
