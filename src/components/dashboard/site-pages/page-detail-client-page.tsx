"use client";

import { useEffect, useMemo, useState } from "react";
import { AsyncDimensionBreakdownCard } from "@/components/dashboard/async-dimension-breakdown-card";
import {
  OverviewMetricsSection,
  OverviewTrendSection,
} from "@/components/dashboard/site-pages/overview-client-page";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";
import {
  fetchEventTypesTab,
  fetchOverviewClientDimensionTab,
  fetchOverviewGeoDimensionTab,
  fetchOverviewPageCardTab,
  fetchOverviewSourceCardTab,
  fetchPageHashTab,
  type OverviewGeoTabRows,
  type OverviewTabRows,
} from "@/lib/dashboard/client-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import {
  resolveContinentLabel,
  resolveCountryLabel,
  resolveLanguageLabel,
} from "@/lib/i18n/code-labels";

type SourceTab = "domain" | "link";
type ClientTab = "browser" | "osVersion" | "deviceType" | "language" | "screenSize";
type GeoTab =
  | "country"
  | "region"
  | "city"
  | "continent"
  | "timezone"
  | "organization";

interface PageDetailClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pagePath: string;
}

function buildPageDetailFilters(
  filters: DashboardFilters,
  pagePath: string,
): DashboardFilters {
  return {
    ...filters,
    path: pagePath,
    title: undefined,
    hostname: undefined,
    entry: undefined,
    exit: undefined,
  };
}

function normalizeLabel(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function mapOverviewRows(
  rows: OverviewTabRows,
  fallbackLabel: string,
  options?: {
    mono?: boolean;
    resolveLabel?: (value: string) => string;
  },
) {
  return rows.map((row, index) => {
    const rawLabel = String(row.label ?? "");
    const label = normalizeLabel(
      options?.resolveLabel ? options.resolveLabel(rawLabel) : rawLabel,
      fallbackLabel,
    );

    return {
      key: `${label}-${index}`,
      label,
      views: Math.max(0, Number(row.views ?? 0)),
      visitors: Math.max(0, Number(row.visitors ?? 0)),
      mono: options?.mono ?? false,
    };
  });
}

function mapGeoRows(
  rows: OverviewGeoTabRows,
  tab: GeoTab,
  locale: Locale,
  messages: AppMessages,
) {
  return rows.map((row, index) => {
    const rawValue = String(row.value ?? "").trim();
    const rawLabel = String(row.label ?? "").trim();
    const fallbackLabel = messages.common.unknown;
    let label = rawLabel || rawValue;

    if (tab === "country") {
      label = resolveCountryLabel(
        rawValue || rawLabel,
        locale,
        fallbackLabel,
      ).label;
    } else if (tab === "continent") {
      label = resolveContinentLabel(
        rawValue || rawLabel,
        fallbackLabel,
        messages.common.continentLabels,
      );
    }

    return {
      key: `${rawValue || label}-${index}`,
      label: normalizeLabel(label, fallbackLabel),
      views: Math.max(0, Number(row.views ?? 0)),
      visitors: Math.max(0, Number(row.visitors ?? 0)),
      mono: tab === "timezone",
    };
  });
}

export function PageDetailClientPage({
  locale,
  messages,
  siteId,
  pagePath,
}: PageDetailClientPageProps) {
  const { filters, window } = useDashboardQuery() as {
    filters: DashboardFilters;
    window: TimeWindow;
  };
  const [titles, setTitles] = useState<string[]>([]);

  const detailFilters = useMemo(
    () => buildPageDetailFilters(filters, pagePath),
    [filters, pagePath],
  );
  const detailRequestKey = useMemo(
    () =>
      [
        siteId,
        pagePath,
        window.from,
        window.to,
        window.interval,
        JSON.stringify(detailFilters ?? {}),
      ].join(":"),
    [detailFilters, pagePath, siteId, window.from, window.interval, window.to],
  );

  useEffect(() => {
    let active = true;
    setTitles([]);

    fetchOverviewPageCardTab(siteId, window, "title", detailFilters, {
      limit: 3,
    })
      .then((rows) => {
        if (!active) return;
        setTitles(
          rows
            .map((row) => String(row.label ?? "").trim())
            .filter((value) => value.length > 0)
            .slice(0, 3),
        );
      })
      .catch(() => {
        if (!active) return;
        setTitles([]);
      });

    return () => {
      active = false;
    };
  }, [detailFilters, siteId, window.from, window.to]);

  const primaryTitle = titles[0] ?? pagePath;
  const alternateTitles = titles.slice(1, 3);

  const hashTabs = useMemo(
    () => [
      {
        value: "hash",
        label: messages.pages.hashTab,
        columnLabel: messages.pages.hashTab,
      },
    ] as const,
    [messages.pages.hashTab],
  );
  const sourceTabs = useMemo(
    () => [
      {
        value: "domain",
        label: messages.overview.sourceTab,
        columnLabel: messages.overview.sourceDomainColumn,
      },
      {
        value: "link",
        label: messages.overview.sourceLinkTab,
        columnLabel: messages.overview.sourceLinkColumn,
      },
    ] as const,
    [
      messages.overview.sourceDomainColumn,
      messages.overview.sourceLinkColumn,
      messages.overview.sourceLinkTab,
      messages.overview.sourceTab,
    ],
  );
  const clientTabs = useMemo(
    () => [
      {
        value: "browser",
        label: messages.common.browser,
        columnLabel: messages.common.browser,
      },
      {
        value: "osVersion",
        label: messages.common.operatingSystem,
        columnLabel: messages.common.operatingSystem,
      },
      {
        value: "deviceType",
        label: messages.common.deviceType,
        columnLabel: messages.common.deviceType,
      },
      {
        value: "language",
        label: messages.common.language,
        columnLabel: messages.common.language,
      },
      {
        value: "screenSize",
        label: messages.common.screenSize,
        columnLabel: messages.common.screenSize,
      },
    ] as const,
    [
      messages.common.browser,
      messages.common.deviceType,
      messages.common.language,
      messages.common.operatingSystem,
      messages.common.screenSize,
    ],
  );
  const geoTabs = useMemo(
    () => [
      {
        value: "country",
        label: messages.common.country,
        columnLabel: messages.common.country,
      },
      {
        value: "region",
        label: messages.common.region,
        columnLabel: messages.common.region,
      },
      {
        value: "city",
        label: messages.common.city,
        columnLabel: messages.common.city,
      },
      {
        value: "continent",
        label: messages.common.continent,
        columnLabel: messages.common.continent,
      },
      {
        value: "timezone",
        label: messages.common.timezone,
        columnLabel: messages.common.timezone,
      },
      {
        value: "organization",
        label: messages.common.organization,
        columnLabel: messages.common.organization,
      },
    ] as const,
    [
      messages.common.city,
      messages.common.continent,
      messages.common.country,
      messages.common.organization,
      messages.common.region,
      messages.common.timezone,
    ],
  );
  const eventTabs = useMemo(
    () => [
      {
        value: "event",
        label: messages.pages.eventTab,
        columnLabel: messages.common.event,
        primaryMetricLabel: messages.pages.eventsMetric,
      },
    ] as const,
    [messages.common.event, messages.pages.eventTab, messages.pages.eventsMetric],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{primaryTitle}</h1>
          <p className="break-all font-mono text-sm text-muted-foreground">{pagePath}</p>
          {alternateTitles.length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {alternateTitles.map((title) => (
                <span key={title}>{title}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <OverviewMetricsSection
        locale={locale}
        messages={messages}
        siteId={siteId}
        window={window}
        filters={detailFilters}
      />

      <OverviewTrendSection
        locale={locale}
        messages={messages}
        siteId={siteId}
        window={window}
        filters={detailFilters}
      />

      <section className="grid items-stretch gap-6 xl:grid-cols-2">
        <AsyncDimensionBreakdownCard
          locale={locale}
          messages={messages}
          tabs={hashTabs}
          requestKey={`${detailRequestKey}:hash`}
          className="h-full"
          loadRows={async () =>
            mapOverviewRows(
              await fetchPageHashTab(siteId, window, detailFilters, {
                limit: 100,
              }),
              messages.pages.noHash,
              { mono: true },
            )}
        />

        <AsyncDimensionBreakdownCard
          locale={locale}
          messages={messages}
          tabs={sourceTabs}
          requestKey={`${detailRequestKey}:source`}
          className="h-full"
          loadRows={async (tab: SourceTab) =>
            mapOverviewRows(
              await fetchOverviewSourceCardTab(siteId, window, tab, detailFilters, {
                limit: 100,
              }),
              messages.overview.direct,
              { mono: true },
            )}
        />

        <AsyncDimensionBreakdownCard
          locale={locale}
          messages={messages}
          tabs={clientTabs}
          requestKey={`${detailRequestKey}:client`}
          className="h-full"
          loadRows={async (tab: ClientTab) =>
            mapOverviewRows(
              await fetchOverviewClientDimensionTab(siteId, window, tab, detailFilters, {
                limit: 100,
              }),
              messages.common.unknown,
              {
                mono: tab === "screenSize",
                resolveLabel:
                  tab === "language"
                    ? (value) =>
                        resolveLanguageLabel(
                          value,
                          locale,
                          messages.common.unknown,
                        ).label
                    : undefined,
              },
            )}
        />

        <AsyncDimensionBreakdownCard
          locale={locale}
          messages={messages}
          tabs={geoTabs}
          requestKey={`${detailRequestKey}:geo`}
          className="h-full"
          loadRows={async (tab: GeoTab) =>
            mapGeoRows(
              await fetchOverviewGeoDimensionTab(siteId, window, tab, detailFilters, {
                limit: 100,
              }),
              tab,
              locale,
              messages,
            )}
        />
      </section>

      <AsyncDimensionBreakdownCard
        locale={locale}
        messages={messages}
        tabs={eventTabs}
        requestKey={`${detailRequestKey}:event`}
        loadRows={async () =>
          mapOverviewRows(
            await fetchEventTypesTab(siteId, window, detailFilters, {
              limit: 100,
            }),
            messages.common.unknown,
            { mono: true },
          )}
      />
    </div>
  );
}
