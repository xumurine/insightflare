"use client";

import { useEffect, useState } from "react";

import { resolveDeviceTypeMeta } from "@/components/dashboard/journey-display";
import { ShareRadialCard } from "@/components/dashboard/share-radial-card";
import { AutoTransition } from "@/components/ui/auto-transition";
import { Spinner } from "@/components/ui/spinner";
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
  if (series.isOther) return messages.devices.otherLabel;
  return series.label;
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
  const [hydrated, setHydrated] = useState(false);

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
        setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [filters, siteId, window.from, window.interval, window.to]);

  const showOverlayLoading = loading && hydrated;
  const showInitialLoading = loading && !hydrated;

  return (
    <div className="relative">
      <div className="grid gap-4">
        <ShareRadialCard
          title={messages.devices.deviceShareTitle}
          items={deviceTrend.series.map((item) => {
            const deviceMeta = resolveDeviceTypeMeta(
              item.label,
              locale,
              messages.common.unknown,
            );
            return {
              key: item.key,
              label: item.isOther
                ? messages.devices.otherLabel
                : deviceMeta.label,
              value: item.visitors,
              isOther: item.isOther,
              icon: item.isOther ? undefined : deviceMeta.Icon,
            };
          })}
          locale={locale}
          valueLabel={messages.common.visitors}
          loading={showInitialLoading}
          emptyLabel={messages.common.noData}
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
            key="device-share-overlay-loading"
            className="inline-flex items-center gap-2 rounded-none border border-border/50 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm"
          >
            <Spinner className="size-3.5" />
            {messages.common.loading}
          </span>
        ) : (
          <div
            key="device-share-overlay-idle"
            className="h-0 w-0 overflow-hidden"
          />
        )}
      </AutoTransition>
    </div>
  );
}
