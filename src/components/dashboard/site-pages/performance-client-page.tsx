"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { PageHeading } from "@/components/dashboard/page-heading";
import { ContentSwitch } from "@/components/dashboard/content-switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoTransition } from "@/components/ui/auto-transition";
import { fetchPerformance } from "@/lib/dashboard/client-data";
import {
  intlLocale,
  numberFormat,
} from "@/lib/dashboard/format";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type {
  PerformanceData,
  PerformanceMetricKey,
} from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";

interface PerformanceClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
}

const PERFORMANCE_SERIES_COLORS = {
  p50: "var(--color-chart-1)",
  p75: "var(--color-chart-2)",
  p95: "var(--color-chart-4)",
} as const;

const PERFORMANCE_CHART_CONFIG = {
  p50: {
    label: "P50",
    color: PERFORMANCE_SERIES_COLORS.p50,
  },
  p75: {
    label: "P75",
    color: PERFORMANCE_SERIES_COLORS.p75,
  },
  p95: {
    label: "P95",
    color: PERFORMANCE_SERIES_COLORS.p95,
  },
} satisfies ChartConfig;

function emptyPerformance(interval: TimeWindow["interval"]): PerformanceData {
  return {
    ok: true,
    interval,
    summaries: {
      ttfb: { avg: null, samples: 0 },
      fcp: { avg: null, samples: 0 },
      lcp: { avg: null, samples: 0 },
      cls: { avg: null, samples: 0 },
      inp: { avg: null, samples: 0 },
    },
    trends: {
      ttfb: [],
      fcp: [],
      lcp: [],
      cls: [],
      inp: [],
    },
  };
}

function intervalStepMs(interval: TimeWindow["interval"]): number {
  if (interval === "minute") return 60_000;
  if (interval === "hour") return 60 * 60_000;
  if (interval === "day") return 24 * 60 * 60_000;
  if (interval === "week") return 7 * 24 * 60 * 60_000;
  return 30 * 24 * 60 * 60_000;
}

function tickDateFormat(localeCode: string, interval: TimeWindow["interval"]) {
  if (interval === "minute" || interval === "hour") {
    return new Intl.DateTimeFormat(localeCode, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (interval === "month") {
    return new Intl.DateTimeFormat(localeCode, {
      year: "numeric",
      month: "short",
    });
  }
  return new Intl.DateTimeFormat(localeCode, {
    month: "short",
    day: "numeric",
  });
}

function tooltipDateFormat(localeCode: string, interval: TimeWindow["interval"]) {
  if (interval === "minute" || interval === "hour") {
    return new Intl.DateTimeFormat(localeCode, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (interval === "month") {
    return new Intl.DateTimeFormat(localeCode, {
      year: "numeric",
      month: "long",
    });
  }
  return new Intl.DateTimeFormat(localeCode, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function PerformanceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-52" />
        </div>
        <div className="space-y-2 lg:text-right">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton
            key={`performance-tab-skeleton-${index}`}
            className="h-8 w-20"
          />
        ))}
      </div>
      <Skeleton className="h-[360px] w-full" />
    </div>
  );
}

function formatMetricValue(
  locale: Locale,
  messages: AppMessages,
  metric: PerformanceMetricKey,
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return "--";
  if (metric === "cls") {
    return `${new Intl.NumberFormat(intlLocale(locale), {
      maximumFractionDigits: 3,
    }).format(value)} ${messages.performance.clsUnit}`;
  }
  return `${numberFormat(locale, Math.round(value))} ${messages.performance.msUnit}`;
}

export function PerformanceClientPage({
  locale,
  messages,
  siteId,
}: PerformanceClientPageProps) {
  const { filters, window } = useDashboardQuery() as {
    filters: DashboardFilters;
    window: TimeWindow;
  };
  const [activeMetric, setActiveMetric] =
    useState<PerformanceMetricKey>("lcp");
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [performanceData, setPerformanceData] = useState<PerformanceData>(() =>
    emptyPerformance(window.interval),
  );
  const [dataWindow, setDataWindow] = useState<
    Pick<TimeWindow, "from" | "to" | "interval">
  >(() => ({
    from: window.from,
    to: window.to,
    interval: window.interval,
  }));

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetchPerformance(siteId, window, filters)
      .then((payload) => {
        if (!active) return;
        setPerformanceData(payload);
        setDataWindow({
          from: window.from,
          to: window.to,
          interval: window.interval,
        });
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [
    filters,
    siteId,
    window.from,
    window.interval,
    window.to,
  ]);

  const metricMeta = useMemo(
    () => ({
      ttfb: { label: messages.performance.ttfb },
      fcp: { label: messages.performance.fcp },
      lcp: { label: messages.performance.lcp },
      cls: { label: messages.performance.cls },
      inp: { label: messages.performance.inp },
    }),
    [messages.performance.cls, messages.performance.fcp, messages.performance.inp, messages.performance.lcp, messages.performance.ttfb],
  );

  const localeCode = intlLocale(locale);
  const axisTickFormatter = useMemo(
    () => tickDateFormat(localeCode, dataWindow.interval),
    [dataWindow.interval, localeCode],
  );
  const tooltipFormatter = useMemo(
    () => tooltipDateFormat(localeCode, dataWindow.interval),
    [dataWindow.interval, localeCode],
  );

  const filledTrend = useMemo(() => {
    const rows = performanceData.trends[activeMetric] ?? [];
    const stepMs = intervalStepMs(dataWindow.interval);
    const byBucket = new Map(
      rows.map((row) => [
        Math.floor(Number(row.timestampMs ?? 0) / stepMs),
        row,
      ] as const),
    );
    const startBucket = Math.floor(dataWindow.from / stepMs);
    const endBucketExclusive = Math.ceil(dataWindow.to / stepMs);
    const filled = [];
    for (let bucket = startBucket; bucket < endBucketExclusive; bucket += 1) {
      const row = byBucket.get(bucket);
      filled.push({
        timestampMs: bucket * stepMs,
        p50: row?.p50 ?? null,
        p75: row?.p75 ?? null,
        p95: row?.p95 ?? null,
        avg: row?.avg ?? null,
        samples: row?.samples ?? 0,
      });
    }
    return filled;
  }, [
    activeMetric,
    dataWindow.from,
    dataWindow.interval,
    dataWindow.to,
    performanceData.trends,
  ]);

  const summary = performanceData.summaries[activeMetric];
  const hasContent = filledTrend.some((row) => row.samples > 0);

  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.performance.title}
        subtitle={messages.performance.subtitle}
      />

      <Tabs
        value={activeMetric}
        onValueChange={(value) => setActiveMetric(value as PerformanceMetricKey)}
        className="gap-0"
      >
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <CardTitle>{messages.performance.chartTitle}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {metricMeta[activeMetric].label}
                </p>
              </div>
              <div className="space-y-1 lg:text-right">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {messages.performance.avgLabel}
                </div>
                <AutoTransition
                  className="text-3xl font-semibold tracking-tight"
                >
                  <span
                    key={`${activeMetric}:${summary?.avg ?? "na"}`}
                  >
                    {formatMetricValue(
                      locale,
                      messages,
                      activeMetric,
                      summary?.avg,
                    )}
                  </span>
                </AutoTransition>
                <div className="text-xs text-muted-foreground">
                  {messages.performance.samplesLabel}:{" "}
                  {numberFormat(locale, summary?.samples ?? 0)}
                </div>
              </div>
            </div>

            <TabsList variant="line" className="h-auto flex-wrap justify-start">
              {(Object.keys(metricMeta) as PerformanceMetricKey[]).map(
                (metric) => (
                  <TabsTrigger
                    key={metric}
                    value={metric}
                    className="px-3 py-2 text-xs"
                  >
                    {metricMeta[metric].label}
                  </TabsTrigger>
                ),
              )}
            </TabsList>
          </CardHeader>
          <CardContent>
            <ContentSwitch
              loading={loading && !hydrated}
              hasContent={hasContent}
              loadingLabel={messages.common.loading}
              loadingContent={<PerformanceSkeleton />}
              emptyContent={<p>{messages.common.noData}</p>}
              minHeightClassName="min-h-[360px]"
            >
              <ChartContainer
                className="h-[360px] w-full aspect-auto"
                config={PERFORMANCE_CHART_CONFIG}
              >
                <LineChart
                  accessibilityLayer
                  data={filledTrend}
                  margin={{ left: 12, right: 12, top: 12 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestampMs"
                    tickFormatter={(value) =>
                      axisTickFormatter.format(new Date(Number(value ?? 0)))
                    }
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={12}
                  />
                  <YAxis
                    tickFormatter={(value) =>
                      formatMetricValue(
                        locale,
                        messages,
                        activeMetric,
                        Number(value ?? 0),
                      )
                    }
                    tickLine={false}
                    axisLine={false}
                    width={activeMetric === "cls" ? 56 : 72}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={(
                      <ChartTooltipContent
                        className="min-w-[14rem]"
                        indicator="line"
                        labelFormatter={(value, payload) => {
                          const timestamp = Number(
                            payload?.[0]?.payload?.timestampMs ?? value ?? 0,
                          );
                          return tooltipFormatter.format(new Date(timestamp));
                        }}
                        formatter={(value, name) => (
                          <div className="flex w-full items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              {String(name ?? "")}
                            </span>
                            <span className="font-mono text-foreground tabular-nums">
                              {formatMetricValue(
                                locale,
                                messages,
                                activeMetric,
                                Number(value ?? 0),
                              )}
                            </span>
                          </div>
                        )}
                      />
                    )}
                  />
                  <ChartLegend
                    content={(
                      <ChartLegendContent className="pt-6 flex-wrap justify-center gap-x-4 gap-y-2" />
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="p50"
                    name={messages.performance.p50Label}
                    stroke={PERFORMANCE_SERIES_COLORS.p50}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive
                  />
                  <Line
                    type="monotone"
                    dataKey="p75"
                    name={messages.performance.p75Label}
                    stroke={PERFORMANCE_SERIES_COLORS.p75}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive
                  />
                  <Line
                    type="monotone"
                    dataKey="p95"
                    name={messages.performance.p95Label}
                    stroke={PERFORMANCE_SERIES_COLORS.p95}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive
                  />
                </LineChart>
              </ChartContainer>
            </ContentSwitch>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
