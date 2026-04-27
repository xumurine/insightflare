"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiCheckboxCircleFill,
  RiCloseCircleFill,
  RiErrorWarningFill,
  RiPulseLine,
  RiRouteLine,
  RiSpeedUpLine,
} from "@remixicon/react";
import { Icon } from "@iconify/react";
import isoCountries from "i18n-iso-countries";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { AnimatedDataTableRow } from "@/components/dashboard/animated-data-table-row";
import { DataTableSwitch } from "@/components/dashboard/data-table-switch";
import { PageHeading } from "@/components/dashboard/page-heading";
import { AutoTransition } from "@/components/ui/auto-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Clickable } from "@/components/ui/clickable";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { fetchPerformance } from "@/lib/dashboard/client-data";
import { intlLocale, numberFormat } from "@/lib/dashboard/format";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type {
  PerformanceCountrySummary,
  PerformanceData,
  PerformanceMetricKey,
  PerformanceRouteMetricSummary,
  PerformanceRouteSummary,
  PerformanceSummary,
  PerformanceTrendPoint,
} from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import {
  resolveCountryFlagCode,
  resolveCountryLabel,
} from "@/lib/i18n/code-labels";
import type { AppMessages } from "@/lib/i18n/messages";
import { formatI18nTemplate } from "@/lib/i18n/template";
import { cn } from "@/lib/utils";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";

interface PerformanceClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
}

type PerformancePanelKey = PerformanceMetricKey | "score";
type PerformanceStatus = "great" | "needs-improvement" | "poor" | "none";
type PathSortKey = "samples" | "value" | "score";
type SortDirection = "asc" | "desc";

interface MetricCardModel {
  key: PerformancePanelKey;
  label: string;
  valueLabel: string;
  value: number | null;
  status: PerformanceStatus;
  score: number | null;
}

interface PathPerformanceRow {
  pathname: string;
  views: number;
  samples: number;
  value: number | null;
  score: number | null;
  status: PerformanceStatus;
}

interface CountryHealthRow {
  country: string;
  label: string;
  iconName: string | null;
  views: number;
  samples: number;
  value: number | null;
  score: number | null;
  status: PerformanceStatus;
}

interface ChartPoint {
  timestampMs: number;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  avg: number | null;
  samples: number;
}

const PERFORMANCE_METRICS: PerformanceMetricKey[] = [
  "ttfb",
  "fcp",
  "lcp",
  "cls",
  "inp",
];

const PERFORMANCE_PANELS: PerformancePanelKey[] = [
  "score",
  ...PERFORMANCE_METRICS,
];

const EMPTY_SUMMARY: PerformanceSummary = {
  avg: null,
  p50: null,
  p75: null,
  p95: null,
  samples: 0,
};

const EMPTY_ROUTE_METRIC_SUMMARY: PerformanceRouteMetricSummary = {
  avg: null,
  p50: null,
  p75: null,
  p95: null,
  samples: 0,
};

const METRIC_THRESHOLDS: Record<
  PerformanceMetricKey,
  { good: number; poor: number }
> = {
  ttfb: { good: 800, poor: 1800 },
  fcp: { good: 1800, poor: 3000 },
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
};

const PERFORMANCE_SERIES_COLORS = {
  p50: "var(--color-chart-1)",
  p75: "var(--color-chart-4)",
  p95: "var(--color-chart-5)",
} as const;

const ZONE_COLORS = {
  great: "var(--color-chart-2)",
  needsImprovement: "oklch(0.75 0.16 80)",
  poor: "var(--color-destructive)",
} as const;

const STATUS_STYLE: Record<
  PerformanceStatus,
  {
    labelClassName: string;
    softClassName: string;
    icon: typeof RiCheckboxCircleFill;
  }
> = {
  great: {
    labelClassName: "text-chart-4",
    softClassName: "bg-chart-4/10 text-chart-4",
    icon: RiCheckboxCircleFill,
  },
  "needs-improvement": {
    labelClassName: "text-[oklch(0.75_0.16_80)]",
    softClassName:
      "bg-[oklch(0.75_0.16_80_/_0.12)] text-[oklch(0.75_0.16_80)]",
    icon: RiErrorWarningFill,
  },
  poor: {
    labelClassName: "text-destructive",
    softClassName: "bg-destructive/10 text-destructive",
    icon: RiCloseCircleFill,
  },
  none: {
    labelClassName: "text-muted-foreground",
    softClassName: "bg-muted text-muted-foreground",
    icon: RiPulseLine,
  },
};

function emptyPerformance(interval: TimeWindow["interval"]): PerformanceData {
  return {
    ok: true,
    interval,
    summaries: {
      ttfb: { ...EMPTY_SUMMARY },
      fcp: { ...EMPTY_SUMMARY },
      lcp: { ...EMPTY_SUMMARY },
      cls: { ...EMPTY_SUMMARY },
      inp: { ...EMPTY_SUMMARY },
    },
    trends: {
      ttfb: [],
      fcp: [],
      lcp: [],
      cls: [],
      inp: [],
    },
    routes: [],
    countries: [],
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

function metricLabel(
  messages: AppMessages,
  metric: PerformanceMetricKey,
): string {
  return messages.performance[metric];
}

function panelLabel(
  messages: AppMessages,
  key: PerformancePanelKey,
): string {
  return key === "score" ? messages.performance.score : metricLabel(messages, key);
}

function metricDescription(
  messages: AppMessages,
  key: PerformancePanelKey,
): string {
  if (key === "score") return messages.performance.scoreDescription;
  return messages.performance[`${key}Description`];
}

function statusLabel(messages: AppMessages, status: PerformanceStatus): string {
  if (status === "great") return messages.performance.great;
  if (status === "needs-improvement") {
    return messages.performance.needsImprovement;
  }
  if (status === "poor") return messages.performance.poor;
  return messages.common.noData;
}

function scoreStatus(score: number | null | undefined): PerformanceStatus {
  if (score == null || !Number.isFinite(score)) return "none";
  if (score >= 90) return "great";
  if (score >= 50) return "needs-improvement";
  return "poor";
}

function metricStatus(
  metric: PerformanceMetricKey,
  value: number | null | undefined,
): PerformanceStatus {
  if (value == null || !Number.isFinite(value)) return "none";
  const thresholds = METRIC_THRESHOLDS[metric];
  if (value <= thresholds.good) return "great";
  if (value <= thresholds.poor) return "needs-improvement";
  return "poor";
}

function metricScore(
  metric: PerformanceMetricKey,
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const thresholds = METRIC_THRESHOLDS[metric];
  if (value <= thresholds.good) return 100;
  if (value >= thresholds.poor) return 0;
  const ratio = (value - thresholds.good) / (thresholds.poor - thresholds.good);
  return Math.max(0, Math.min(100, 100 - ratio * 100));
}

function averageScore(values: Array<number | null | undefined>): number | null {
  const scores = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (scores.length === 0) return null;
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function roundedScore(score: number | null | undefined): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  return Math.round(score);
}

function scoreSummary(data: PerformanceData): PerformanceSummary {
  const scoreForPercentile = (
    percentile: keyof Pick<PerformanceSummary, "avg" | "p50" | "p75" | "p95">,
  ) =>
    averageScore(
      PERFORMANCE_METRICS.map((metric) =>
        metricScore(metric, data.summaries[metric]?.[percentile]),
      ),
    );

  return {
    avg: scoreForPercentile("avg"),
    p50: scoreForPercentile("p50"),
    p75: scoreForPercentile("p75"),
    p95: scoreForPercentile("p95"),
    samples: Math.max(
      0,
      ...PERFORMANCE_METRICS.map(
        (metric) => data.summaries[metric]?.samples ?? 0,
      ),
    ),
  };
}

function routeMetric(
  route: PerformanceRouteSummary,
  metric: PerformanceMetricKey,
): PerformanceRouteMetricSummary {
  return route.metrics[metric] ?? EMPTY_ROUTE_METRIC_SUMMARY;
}

function routeScore(route: PerformanceRouteSummary): number | null {
  return averageScore(
    PERFORMANCE_METRICS.map((metric) =>
      metricScore(metric, routeMetric(route, metric).p75),
    ),
  );
}

function routeSamples(
  route: PerformanceRouteSummary,
  key: PerformancePanelKey,
): number {
  if (key !== "score") return routeMetric(route, key).samples ?? 0;
  return Math.max(
    0,
    ...PERFORMANCE_METRICS.map(
      (metric) => routeMetric(route, metric).samples ?? 0,
    ),
  );
}

function routeValue(
  route: PerformanceRouteSummary,
  key: PerformancePanelKey,
): number | null {
  if (key === "score") return routeScore(route);
  return routeMetric(route, key).p75;
}

function routeStatus(
  route: PerformanceRouteSummary,
  key: PerformancePanelKey,
): PerformanceStatus {
  const value = routeValue(route, key);
  if (key === "score") return scoreStatus(value);
  return metricStatus(key, value);
}

function countryMetric(
  country: PerformanceCountrySummary,
  metric: PerformanceMetricKey,
): PerformanceRouteMetricSummary {
  return country.metrics[metric] ?? EMPTY_ROUTE_METRIC_SUMMARY;
}

function countryScore(country: PerformanceCountrySummary): number | null {
  return averageScore(
    PERFORMANCE_METRICS.map((metric) =>
      metricScore(metric, countryMetric(country, metric).p75),
    ),
  );
}

function countrySamples(
  country: PerformanceCountrySummary,
  key: PerformancePanelKey,
): number {
  if (key !== "score") return countryMetric(country, key).samples ?? 0;
  return Math.max(
    0,
    ...PERFORMANCE_METRICS.map(
      (metric) => countryMetric(country, metric).samples ?? 0,
    ),
  );
}

function countryValue(
  country: PerformanceCountrySummary,
  key: PerformancePanelKey,
): number | null {
  if (key === "score") return countryScore(country);
  return countryMetric(country, key).p75;
}

function countryStatus(
  country: PerformanceCountrySummary,
  key: PerformancePanelKey,
): PerformanceStatus {
  const value = countryValue(country, key);
  if (key === "score") return scoreStatus(value);
  return metricStatus(key, value);
}

function formatMetricValue(
  locale: Locale,
  messages: AppMessages,
  metric: PerformanceMetricKey,
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return "--";
  if (metric === "cls") {
    const formatted = new Intl.NumberFormat(intlLocale(locale), {
      maximumFractionDigits: 3,
    }).format(value);
    return `${formatted} ${messages.performance.clsUnit}`;
  }
  if (metric === "inp") {
    return `${numberFormat(locale, Math.round(value))} ${messages.performance.msUnit}`;
  }
  const seconds = value / 1000;
  const formatted = new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 2,
    minimumFractionDigits: seconds < 10 ? 2 : 1,
  }).format(seconds);
  return `${formatted} ${messages.performance.secondsUnit}`;
}

function formatPanelValue(
  locale: Locale,
  messages: AppMessages,
  key: PerformancePanelKey,
  value: number | null | undefined,
): string {
  if (key === "score") {
    const score = roundedScore(value);
    return score == null ? "--" : numberFormat(locale, score);
  }
  return formatMetricValue(locale, messages, key, value);
}

function chartDomain(
  key: PerformancePanelKey,
  points: ChartPoint[],
): [number, number] {
  if (key === "score") return [0, 100];
  const thresholds = METRIC_THRESHOLDS[key];
  const observedMax = points.reduce((max, point) => {
    const values = [point.p50, point.p75, point.p95].filter(
      (value): value is number => value != null && Number.isFinite(value),
    );
    return Math.max(max, ...values);
  }, thresholds.poor);

  if (key === "cls") {
    return [0, Math.max(0.3, Math.ceil(observedMax * 120) / 100)];
  }
  return [0, Math.max(thresholds.poor * 1.2, Math.ceil(observedMax * 1.2 / 100) * 100)];
}

function zoneBackground(key: PerformancePanelKey, domainMax: number): string {
  const great = "color-mix(in oklch, var(--color-chart-4) 26%, transparent)";
  const needs =
    "color-mix(in oklch, oklch(0.75 0.16 80) 24%, transparent)";
  const poor = "color-mix(in oklch, var(--color-destructive) 24%, transparent)";

  if (key === "score") {
    return `linear-gradient(to bottom, ${great} 0% 10%, ${needs} 10% 50%, ${poor} 50% 100%)`;
  }

  const thresholds = METRIC_THRESHOLDS[key];
  const safeDomainMax = Math.max(domainMax, thresholds.poor);
  const poorEnd = Math.max(
    0,
    Math.min(100, 100 - (thresholds.poor / safeDomainMax) * 100),
  );
  const needsEnd = Math.max(
    poorEnd,
    Math.min(100, 100 - (thresholds.good / safeDomainMax) * 100),
  );
  return `linear-gradient(to bottom, ${poor} 0% ${poorEnd}%, ${needs} ${poorEnd}% ${needsEnd}%, ${great} ${needsEnd}% 100%)`;
}

function statusColor(status: PerformanceStatus): string {
  if (status === "great") return "var(--color-chart-4)";
  if (status === "needs-improvement") return "oklch(0.75 0.16 80)";
  if (status === "poor") return "var(--color-destructive)";
  return "var(--color-muted-foreground)";
}

function railSegments(): Array<{
  status: Exclude<PerformanceStatus, "none">;
  width: number;
}> {
  return [
    { status: "poor", width: 50 },
    { status: "needs-improvement", width: 40 },
    { status: "great", width: 10 },
  ];
}

function railMarkerPosition(
  key: PerformancePanelKey,
  value: number | null,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const score = key === "score" ? value : metricScore(key, value);
  if (score == null || !Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, score));
}

function buildScoreTrend(
  performanceData: PerformanceData,
  dataWindow: Pick<TimeWindow, "from" | "to" | "interval">,
): ChartPoint[] {
  const stepMs = intervalStepMs(dataWindow.interval);
  const metricMaps = new Map<
    PerformanceMetricKey,
    Map<number, PerformanceTrendPoint>
  >();

  for (const metric of PERFORMANCE_METRICS) {
    metricMaps.set(
      metric,
      new Map(
        (performanceData.trends[metric] ?? []).map((point) => [
          Math.floor(Number(point.timestampMs ?? 0) / stepMs),
          point,
        ]),
      ),
    );
  }

  const startBucket = Math.floor(dataWindow.from / stepMs);
  const endBucketExclusive = Math.ceil(dataWindow.to / stepMs);
  const rows: ChartPoint[] = [];

  for (let bucket = startBucket; bucket < endBucketExclusive; bucket += 1) {
    const metricPoints = PERFORMANCE_METRICS.map((metric) => ({
      metric,
      point: metricMaps.get(metric)?.get(bucket),
    }));
    rows.push({
      timestampMs: bucket * stepMs,
      p50: averageScore(
        metricPoints.map(({ metric, point }) => metricScore(metric, point?.p50)),
      ),
      p75: averageScore(
        metricPoints.map(({ metric, point }) => metricScore(metric, point?.p75)),
      ),
      p95: averageScore(
        metricPoints.map(({ metric, point }) => metricScore(metric, point?.p95)),
      ),
      avg: averageScore(
        metricPoints.map(({ metric, point }) => metricScore(metric, point?.avg)),
      ),
      samples: Math.max(0, ...metricPoints.map(({ point }) => point?.samples ?? 0)),
    });
  }

  return rows;
}

function buildMetricTrend(
  performanceData: PerformanceData,
  key: PerformanceMetricKey,
  dataWindow: Pick<TimeWindow, "from" | "to" | "interval">,
): ChartPoint[] {
  const rows = performanceData.trends[key] ?? [];
  const stepMs = intervalStepMs(dataWindow.interval);
  const byBucket = new Map(
    rows.map((row) => [
      Math.floor(Number(row.timestampMs ?? 0) / stepMs),
      row,
    ]),
  );
  const startBucket = Math.floor(dataWindow.from / stepMs);
  const endBucketExclusive = Math.ceil(dataWindow.to / stepMs);
  const filled: ChartPoint[] = [];

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
}

function TrendZones({
  activePanel,
}: {
  activePanel: PerformancePanelKey;
}) {
  if (activePanel === "score") {
    return (
      <>
        <ReferenceLine
          y={50}
          stroke={ZONE_COLORS.needsImprovement}
          strokeDasharray="7 5"
          strokeWidth={2}
        />
        <ReferenceLine
          y={90}
          stroke={ZONE_COLORS.great}
          strokeDasharray="7 5"
          strokeWidth={2}
        />
      </>
    );
  }

  const { good, poor } = METRIC_THRESHOLDS[activePanel];
  return (
    <>
      <ReferenceLine
        y={good}
        stroke={ZONE_COLORS.great}
        strokeDasharray="7 5"
        strokeWidth={2}
      />
      <ReferenceLine
        y={poor}
        stroke={ZONE_COLORS.needsImprovement}
        strokeDasharray="7 5"
        strokeWidth={2}
      />
    </>
  );
}

function PerformanceSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="space-y-3 self-start">
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={`performance-rail-skeleton-${index}`} className="overflow-hidden">
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-1.5 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-4">
        <Card>
          <CardContent className="grid gap-6 p-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="space-y-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-28 rounded-full" />
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-20 w-full" />
            </div>
            <div className="space-y-4">
              <Skeleton className="ml-auto h-7 w-24" />
              <Skeleton className="h-20 w-full" />
              <div className="grid gap-3 sm:grid-cols-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[340px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[260px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SegmentedThresholdBar({
  panelKey,
  value,
  status,
}: {
  panelKey: PerformancePanelKey;
  value: number | null;
  status: PerformanceStatus;
}) {
  const marker = railMarkerPosition(panelKey, value);
  const segments = railSegments();

  return (
    <div className="relative h-3">
      <div className="absolute inset-x-0 top-1/2 flex h-0.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
        {segments.map((segment) => (
          <div
            key={`${panelKey}-${segment.status}`}
            className="h-full"
            style={{
              width: `${segment.width}%`,
              backgroundColor: statusColor(segment.status),
            }}
          />
        ))}
      </div>
      {marker == null ? null : (
        <span
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
          style={{
            left: `${marker}%`,
            backgroundColor: statusColor(status),
          }}
        />
      )}
    </div>
  );
}

function PerformanceRail({
  activePanel,
  cards,
  onSelect,
}: {
  activePanel: PerformancePanelKey;
  cards: MetricCardModel[];
  onSelect: (key: PerformancePanelKey) => void;
}) {
  return (
    <div className="space-y-3 self-start lg:sticky lg:top-[7.5rem]">
      {cards.map((card) => {
        const active = card.key === activePanel;
        const statusStyle = STATUS_STYLE[card.status];
        const StatusIcon = statusStyle.icon;
        return (
          <Clickable
            key={card.key}
            className="block w-full text-left"
            enableHoverScale={false}
            tapScale={0.985}
            aria-label={card.label}
            onClick={() => onSelect(card.key)}
          >
            <div
              className={cn(
                "relative overflow-hidden rounded-none bg-card p-4 ring-1 ring-border/70 transition-all duration-200",
                "hover:bg-muted/35",
              )}
            >
              <div
                className={cn(
                  "pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary opacity-0 transition-opacity duration-200",
                  active && "opacity-100",
                )}
              />
              <div className="relative space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-muted-foreground">
                      {card.label}
                    </div>
                    <AutoTransition className="mt-2" duration={0.18}>
                      <div
                        key={`${card.key}-${card.valueLabel}`}
                        className="text-2xl font-semibold tracking-tight"
                      >
                        {card.valueLabel}
                      </div>
                    </AutoTransition>
                  </div>
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      statusStyle.softClassName,
                    )}
                  >
                    <StatusIcon className="size-4" />
                  </div>
                </div>
                <SegmentedThresholdBar
                  panelKey={card.key}
                  value={card.value}
                  status={card.status}
                />
              </div>
            </div>
          </Clickable>
        );
      })}
    </div>
  );
}

function MetricSummaryCard({
  locale,
  messages,
  activePanel,
  activeSummary,
  activeValue,
  pathCount,
}: {
  locale: Locale;
  messages: AppMessages;
  activePanel: PerformancePanelKey;
  activeSummary: PerformanceSummary;
  activeValue: number | null;
  pathCount: number;
}) {
  const activeStatus =
    activePanel === "score"
      ? scoreStatus(activeValue)
      : metricStatus(activePanel, activeValue);
  const statusStyle = STATUS_STYLE[activeStatus];
  const StatusIcon = statusStyle.icon;
  const score =
    activePanel === "score"
      ? activeValue
      : metricScore(activePanel, activeValue);
  const scoreValue = roundedScore(score);
  const displayValue = formatPanelValue(locale, messages, activePanel, activeValue);
  const description = metricDescription(messages, activePanel);
  const thresholdText =
    activePanel === "score"
      ? messages.performance.scoreThresholdText
      : formatI18nTemplate(messages.performance.metricThresholdText, {
          good: formatMetricValue(
            locale,
            messages,
            activePanel,
            METRIC_THRESHOLDS[activePanel].good,
          ),
          poor: formatMetricValue(
            locale,
            messages,
            activePanel,
            METRIC_THRESHOLDS[activePanel].poor,
          ),
        });
  const reading =
    activeSummary.samples > 0
      ? formatI18nTemplate(messages.performance.currentReading, {
          metric: panelLabel(messages, activePanel),
          value: displayValue,
          score: scoreValue == null ? "--" : numberFormat(locale, scoreValue),
          samples: numberFormat(locale, activeSummary.samples),
          status: statusLabel(messages, activeStatus),
        })
      : messages.common.noData;
  const ringPercent = scoreValue == null ? 0 : Math.max(0, Math.min(100, scoreValue));
  const ringColor = statusColor(activeStatus);

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-5 p-5 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <AutoTransition duration={0.2}>
            <div key={`${activePanel}-${displayValue}`} className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="text-sm text-muted-foreground">
                    {panelLabel(messages, activePanel)}
                  </div>
                  <div className="text-3xl font-semibold tracking-tight">
                    {displayValue}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusIcon
                      className={cn("size-5", statusStyle.labelClassName)}
                    />
                    <span className={cn("font-medium", statusStyle.labelClassName)}>
                      {statusLabel(messages, activeStatus)}
                    </span>
                  </div>
                </div>
                <div
                  className="relative flex size-[4.5rem] shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(${ringColor} ${ringPercent * 3.6}deg, var(--muted) 0deg)`,
                  }}
                >
                  <div className="absolute inset-[6px] rounded-full bg-card" />
                  <div className="relative z-10 flex items-baseline">
                    <span className="text-xl font-semibold tracking-tight">
                      {scoreValue ?? "--"}
                    </span>
                    {scoreValue == null ? null : (
                      <span className="ml-0.5 text-[0.65rem] font-medium text-muted-foreground">
                        %
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          </AutoTransition>
          <div className="mt-auto grid grid-cols-2 gap-3">
            <div className="flex min-h-[4.75rem] flex-col justify-between rounded-none bg-muted/45 p-3">
              <div className="text-xs text-muted-foreground">
                {messages.performance.pathsAnalyzedLabel}
              </div>
              <div className="font-mono text-lg font-semibold tabular-nums">
                {numberFormat(locale, pathCount)}
              </div>
            </div>
            <div className="flex min-h-[4.75rem] flex-col justify-between rounded-none bg-muted/45 p-3">
              <div className="text-xs text-muted-foreground">
                {messages.performance.samplesLabel}
              </div>
              <div className="font-mono text-lg font-semibold tabular-nums">
                {numberFormat(locale, activeSummary.samples)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">
              {messages.performance.interpretationTitle}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{reading}</p>
          </div>
          <div className="rounded-none bg-muted/45 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <RiSpeedUpLine className="size-4 text-muted-foreground" />
              {messages.performance.datasetTitle}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{thresholdText}</p>
          </div>

          <div className="mt-auto grid gap-3 sm:grid-cols-3">
            {[
              ["p50", messages.performance.p50Label, activeSummary.p50],
              ["p75", messages.performance.p75Label, activeSummary.p75],
              ["p95", messages.performance.p95Label, activeSummary.p95],
            ].map(([key, label, value]) => (
              <div
                key={key as string}
                className="flex min-h-[4.75rem] flex-col justify-between rounded-none bg-muted/45 p-3"
              >
                <div className="text-xs text-muted-foreground">{label as string}</div>
                <div className="font-mono text-sm font-medium tabular-nums">
                  {formatPanelValue(
                    locale,
                    messages,
                    activePanel,
                    value as number | null,
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PerformanceTrendCard({
  locale,
  messages,
  activePanel,
  dataWindow,
  points,
}: {
  locale: Locale;
  messages: AppMessages;
  activePanel: PerformancePanelKey;
  dataWindow: Pick<TimeWindow, "from" | "to" | "interval">;
  points: ChartPoint[];
}) {
  const localeCode = intlLocale(locale);
  const axisTickFormatter = useMemo(
    () => tickDateFormat(localeCode, dataWindow.interval),
    [dataWindow.interval, localeCode],
  );
  const tooltipFormatter = useMemo(
    () => tooltipDateFormat(localeCode, dataWindow.interval),
    [dataWindow.interval, localeCode],
  );
  const chartConfig = useMemo(
    () =>
      ({
        p50: {
          label: messages.performance.p50Label,
          color: PERFORMANCE_SERIES_COLORS.p50,
        },
        p75: {
          label: messages.performance.p75Label,
          color: PERFORMANCE_SERIES_COLORS.p75,
        },
        p95: {
          label: messages.performance.p95Label,
          color: PERFORMANCE_SERIES_COLORS.p95,
        },
      }) satisfies ChartConfig,
    [
      messages.performance.p50Label,
      messages.performance.p75Label,
      messages.performance.p95Label,
    ],
  );
  const [, domainMax] = chartDomain(activePanel, points);
  const xStart = points[0]?.timestampMs ?? dataWindow.from;
  const rawXEnd = points[points.length - 1]?.timestampMs ?? dataWindow.to;
  const xEnd = rawXEnd > xStart ? rawXEnd : xStart + 1;
  const visiblePointCount = points.filter(
    (point) => point.p50 != null || point.p75 != null || point.p95 != null,
  ).length;
  const lineDot = visiblePointCount <= 1
    ? { r: 3.2, strokeWidth: 0 }
    : false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>{messages.performance.chartTitle}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {panelLabel(messages, activePanel)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div
            className="pointer-events-none absolute top-3 right-3 bottom-16 left-20 rounded-none"
            style={{ background: zoneBackground(activePanel, domainMax) }}
          />
        <ChartContainer className="relative z-10 h-[360px] w-full aspect-auto" config={chartConfig}>
          <LineChart
            accessibilityLayer
            data={points}
            margin={{ left: 12, right: 12, top: 12, bottom: 4 }}
          >
            <TrendZones activePanel={activePanel} />
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="timestampMs"
              domain={[xStart, xEnd]}
              tickFormatter={(value) =>
                axisTickFormatter.format(new Date(Number(value ?? 0)))
              }
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={12}
            />
            <YAxis
              domain={[0, domainMax]}
              tickFormatter={(value) =>
                formatPanelValue(
                  locale,
                  messages,
                  activePanel,
                  Number(value ?? 0),
                )
              }
              tickLine={false}
              axisLine={false}
              width={activePanel === "cls" ? 64 : 80}
            />
            <ChartTooltip
              cursor={false}
              content={
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
                        {formatPanelValue(
                          locale,
                          messages,
                          activePanel,
                          Number(value ?? 0),
                        )}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend
              content={
                <ChartLegendContent className="pt-6 flex-wrap justify-center gap-x-4 gap-y-2" />
              }
            />
            <Line
              type="monotone"
              dataKey="p50"
              name={messages.performance.p50Label}
              stroke={PERFORMANCE_SERIES_COLORS.p50}
              strokeWidth={2}
              dot={lineDot}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive
            />
            <Line
              type="monotone"
              dataKey="p75"
              name={messages.performance.p75Label}
              stroke={PERFORMANCE_SERIES_COLORS.p75}
              strokeWidth={2.4}
              dot={lineDot}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive
            />
            <Line
              type="monotone"
              dataKey="p95"
              name={messages.performance.p95Label}
              stroke={PERFORMANCE_SERIES_COLORS.p95}
              strokeWidth={2}
              dot={lineDot}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive
            />
          </LineChart>
        </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}

type CountryFeature = Feature<Geometry, Record<string, unknown>>;
type CountriesFeatureCollection = FeatureCollection<Geometry, Record<string, unknown>>;

const WORLD_MAP_WIDTH = 960;
const WORLD_MAP_HEIGHT = 430;

function normalizeCountryCode(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function resolveCountryCodeFromFeature(
  feature: CountryFeature | null | undefined,
): string | null {
  if (!feature) return null;
  const props = feature.properties ?? {};
  const alpha2Candidates = [
    props.ISO_A2,
    props.iso_a2,
    props.ADM0_A2,
    props.adm0_a2,
    props.WB_A2,
    props.wb_a2,
  ];

  for (const candidate of alpha2Candidates) {
    const code = normalizeCountryCode(String(candidate ?? ""));
    if (code) return code;
  }

  const alpha3Candidates = [
    props.ISO_A3,
    props.iso_a3,
    props.ADM0_A3,
    props.adm0_a3,
    props.WB_A3,
    props.wb_a3,
    props.SOV_A3,
    props.sov_a3,
    typeof feature.id === "string" ? feature.id : null,
  ];
  for (const candidate of alpha3Candidates) {
    const alpha3 = String(candidate ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(alpha3)) continue;
    const code = normalizeCountryCode(isoCountries.alpha3ToAlpha2(alpha3) ?? "");
    if (code) return code;
  }

  const nameCandidates = [props.name, props.NAME, props.admin, props.ADMIN];
  for (const candidate of nameCandidates) {
    const name = String(candidate ?? "").trim();
    if (!name) continue;
    const code = normalizeCountryCode(isoCountries.getAlpha2Code(name, "en") ?? "");
    if (code) return code;
  }

  return null;
}

function projectWorldPosition(position: Position): [number, number] {
  const longitude = Number(position[0] ?? 0);
  const latitude = Number(position[1] ?? 0);
  return [
    ((longitude + 180) / 360) * WORLD_MAP_WIDTH,
    ((90 - latitude) / 180) * WORLD_MAP_HEIGHT,
  ];
}

function ringToPath(ring: Position[]): string {
  return ring
    .map((position, index) => {
      const [x, y] = projectWorldPosition(position);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function geometryToPath(geometry: Geometry | null | undefined): string {
  if (!geometry) return "";
  if (geometry.type === "Polygon") {
    return geometry.coordinates
      .map((ring) => `${ringToPath(ring)} Z`)
      .join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .flatMap((polygon) => polygon.map((ring) => `${ringToPath(ring)} Z`))
      .join(" ");
  }
  return "";
}

function countryFillOpacity(status: PerformanceStatus, samples: number): number {
  if (samples <= 0 || status === "none") return 0.07;
  if (status === "great") return 0.48;
  if (status === "needs-improvement") return 0.42;
  return 0.46;
}

function CountryLabelWithFlag({
  label,
  iconName,
}: {
  label: string;
  iconName: string | null;
}) {
  if (!iconName) {
    return <span className="truncate">{label}</span>;
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Icon
        icon={iconName}
        style={{ width: 16, height: 12 }}
        className="block shrink-0"
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

function PerformanceHealthMapCard({
  locale,
  messages,
  activePanel,
  countries,
}: {
  locale: Locale;
  messages: AppMessages;
  activePanel: PerformancePanelKey;
  countries: CountryHealthRow[];
}) {
  const [featureCollection, setFeatureCollection] =
    useState<CountriesFeatureCollection | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/world-countries", { cache: "force-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active) return;
        const next =
          payload &&
          typeof payload === "object" &&
          (payload as { type?: unknown }).type === "FeatureCollection" &&
          Array.isArray((payload as { features?: unknown }).features)
            ? (payload as CountriesFeatureCollection)
            : null;
        setFeatureCollection(next);
      })
      .catch(() => {
        if (!active) return;
        setFeatureCollection(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const countryMap = useMemo(() => {
    const map = new Map<string, CountryHealthRow>();
    for (const country of countries) {
      const code = normalizeCountryCode(country.country);
      if (!code) continue;
      map.set(code, country);
    }
    return map;
  }, [countries]);
  const [sort, setSort] = useState<{ key: PathSortKey; direction: SortDirection }>({
    key: "samples",
    direction: "desc",
  });
  const sortedCountries = useMemo(() => {
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...countries].sort((a, b) => {
      if (sort.key === "samples") return (a.samples - b.samples) * direction;
      if (sort.key === "score") {
        return ((a.score ?? -1) - (b.score ?? -1)) * direction;
      }
      return ((a.value ?? -1) - (b.value ?? -1)) * direction;
    });
  }, [countries, sort.direction, sort.key]);
  const maxSamples = Math.max(1, ...sortedCountries.map((row) => row.samples));
  const groupedRows = useMemo(
    () => ({
      poor: sortedCountries.filter((row) => row.status === "poor"),
      "needs-improvement": sortedCountries.filter(
        (row) => row.status === "needs-improvement",
      ),
      great: sortedCountries.filter((row) => row.status === "great"),
    }),
    [sortedCountries],
  );

  const updateSort = (key: PathSortKey) => {
    setSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : { key, direction: "desc" },
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>{messages.performance.countryHealthTitle}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatI18nTemplate(messages.performance.countryHealthSubtitle, {
                metric: panelLabel(messages, activePanel),
              })}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative min-h-[22rem] overflow-hidden border-t border-border/70 bg-muted/20 p-4">
          {featureCollection ? (
            <svg
              role="img"
              aria-label={messages.performance.countryHealthTitle}
              className="h-full min-h-[20rem] w-full"
              viewBox={`0 0 ${WORLD_MAP_WIDTH} ${WORLD_MAP_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <rect
                width={WORLD_MAP_WIDTH}
                height={WORLD_MAP_HEIGHT}
                fill="transparent"
              />
              {featureCollection.features.map((feature, index) => {
                const code = resolveCountryCodeFromFeature(feature);
                const country = code ? countryMap.get(code) : null;
                const status = country?.status ?? "none";
                const path = geometryToPath(feature.geometry);
                if (!path) return null;
                return (
                  <path
                    key={`${code ?? "country"}-${index}`}
                    d={path}
                    fill={statusColor(status)}
                    fillOpacity={countryFillOpacity(status, country?.samples ?? 0)}
                    stroke="var(--border)"
                    strokeOpacity={0.86}
                    strokeWidth={0.65}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
          ) : (
            <Skeleton className="h-[20rem] w-full rounded-none" />
          )}
        </div>
        <div className="grid min-h-[18rem] divide-y divide-border/70 border-t border-border/70 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {(["poor", "needs-improvement", "great"] as const).map((status) => (
            <CountryStatusColumn
              key={status}
              locale={locale}
              messages={messages}
              activePanel={activePanel}
              status={status}
              rows={groupedRows[status]}
              maxSamples={maxSamples}
              sort={sort}
              onSort={updateSort}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CountryStatusColumn({
  locale,
  messages,
  activePanel,
  status,
  rows,
  maxSamples,
  sort,
  onSort,
}: {
  locale: Locale;
  messages: AppMessages;
  activePanel: PerformancePanelKey;
  status: Exclude<PerformanceStatus, "none">;
  rows: CountryHealthRow[];
  maxSamples: number;
  sort: { key: PathSortKey; direction: SortDirection };
  onSort: (key: PathSortKey) => void;
}) {
  const statusStyle = STATUS_STYLE[status];
  const StatusIcon = statusStyle.icon;
  const header = (
    <TableRow className="hover:bg-transparent">
      <TableHead className="h-8 p-0">
        <div className="px-3">{messages.common.country}</div>
      </TableHead>
      <TableHead className="h-8 p-0 text-right">
        <div className="px-3">
          <SortHeaderButton
            active={sort.key === "samples"}
            direction={sort.direction}
            onClick={() => onSort("samples")}
          >
            {messages.performance.samplesLabel}
          </SortHeaderButton>
        </div>
      </TableHead>
      <TableHead className="h-8 p-0 text-right">
        <div className="px-3">
          <SortHeaderButton
            active={sort.key === "value"}
            direction={sort.direction}
            onClick={() => onSort("value")}
          >
            {activePanel === "score"
              ? messages.performance.score
              : messages.performance.metricValueColumn}
          </SortHeaderButton>
        </div>
      </TableHead>
    </TableRow>
  );

  const renderedRows = rows.map((row) => {
    const progressWidth = `${Math.max(2, Math.min(100, (row.samples / maxSamples) * 100))}%`;
    return (
      <AnimatedDataTableRow
        key={`${status}-${row.country}`}
        className="group/row bg-no-repeat transition-[background-size,filter] duration-300 ease-out hover:brightness-[0.98] dark:hover:brightness-125"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--muted) 0%, var(--muted) 100%)",
          backgroundPosition: "left top",
          backgroundSize: `${progressWidth} 100%`,
        }}
      >
        <TableCell className="p-0 whitespace-normal align-top">
          <div className="max-w-[18rem] px-3 py-2 leading-5">
            <CountryLabelWithFlag label={row.label} iconName={row.iconName} />
          </div>
        </TableCell>
        <TableCell className="p-0 text-right align-top">
          <div className="px-3 py-2 font-mono tabular-nums">
            {numberFormat(locale, row.samples)}
          </div>
        </TableCell>
        <TableCell className="p-0 text-right align-top">
          <div className="px-3 py-2 font-mono tabular-nums">
            {formatPanelValue(locale, messages, activePanel, row.value)}
          </div>
        </TableCell>
      </AnimatedDataTableRow>
    );
  });

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3 px-4 py-4">
        <div className="min-w-0 space-y-1">
          <div
            className={cn(
              "flex items-center gap-2 font-medium",
              statusStyle.labelClassName,
            )}
          >
            <StatusIcon className="size-4" />
            {statusLabel(messages, status)}
          </div>
          <div className="text-xs text-muted-foreground">
            {pathStatusRangeLabel(locale, messages, activePanel, status)}
          </div>
        </div>
        <div className="font-mono text-sm text-muted-foreground tabular-nums">
          {numberFormat(locale, rows.length)}
        </div>
      </div>
      <div className="pb-4">
        <DataTableSwitch
          loading={false}
          hasContent={rows.length > 0}
          loadingLabel={messages.common.loading}
          emptyLabel={messages.common.noData}
          colSpan={3}
          contentKey={`countries-${activePanel}-${status}-${sort.key}-${sort.direction}-${rows.length}`}
          header={header}
          rows={renderedRows}
        />
      </div>
    </div>
  );
}

function SortHeaderButton({
  active,
  direction,
  children,
  onClick,
}: {
  active: boolean;
  direction: SortDirection;
  children: string;
  onClick: () => void;
}) {
  const SortIcon = direction === "asc" ? RiArrowUpSLine : RiArrowDownSLine;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
      )}
      onClick={onClick}
    >
      <span>{children}</span>
      {active ? <SortIcon className="size-3" /> : null}
    </button>
  );
}

function pathStatusRangeLabel(
  locale: Locale,
  messages: AppMessages,
  activePanel: PerformancePanelKey,
  status: Exclude<PerformanceStatus, "none">,
): string {
  if (activePanel === "score") {
    if (status === "poor") return "<50";
    if (status === "needs-improvement") return "50 - 90";
    return ">90";
  }

  const thresholds = METRIC_THRESHOLDS[activePanel];
  if (status === "poor") {
    return `>${formatMetricValue(locale, messages, activePanel, thresholds.poor)}`;
  }
  if (status === "needs-improvement") {
    return `${formatMetricValue(
      locale,
      messages,
      activePanel,
      thresholds.good,
    )} - ${formatMetricValue(locale, messages, activePanel, thresholds.poor)}`;
  }
  return `<=${formatMetricValue(locale, messages, activePanel, thresholds.good)}`;
}

function PathStatusColumn({
  locale,
  messages,
  activePanel,
  status,
  rows,
  maxSamples,
  sort,
  onSort,
}: {
  locale: Locale;
  messages: AppMessages;
  activePanel: PerformancePanelKey;
  status: Exclude<PerformanceStatus, "none">;
  rows: PathPerformanceRow[];
  maxSamples: number;
  sort: { key: PathSortKey; direction: SortDirection };
  onSort: (key: PathSortKey) => void;
}) {
  const statusStyle = STATUS_STYLE[status];
  const StatusIcon = statusStyle.icon;
  const header = (
    <TableRow className="hover:bg-transparent">
      <TableHead className="h-8 p-0">
        <div className="px-3">{messages.common.path}</div>
      </TableHead>
      <TableHead className="h-8 p-0 text-right">
        <div className="px-3">
          <SortHeaderButton
            active={sort.key === "samples"}
            direction={sort.direction}
            onClick={() => onSort("samples")}
          >
            {messages.performance.samplesLabel}
          </SortHeaderButton>
        </div>
      </TableHead>
      <TableHead className="h-8 p-0 text-right">
        <div className="px-3">
          <SortHeaderButton
            active={sort.key === "value"}
            direction={sort.direction}
            onClick={() => onSort("value")}
          >
            {activePanel === "score"
              ? messages.performance.score
              : messages.performance.metricValueColumn}
          </SortHeaderButton>
        </div>
      </TableHead>
    </TableRow>
  );

  const renderedRows = rows.map((row) => {
    const progressWidth = `${Math.max(2, Math.min(100, (row.samples / maxSamples) * 100))}%`;
    return (
      <AnimatedDataTableRow
        key={`${status}-${row.pathname}`}
        className="group/row bg-no-repeat transition-[background-size,filter] duration-300 ease-out hover:brightness-[0.98] dark:hover:brightness-125"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--muted) 0%, var(--muted) 100%)",
          backgroundPosition: "left top",
          backgroundSize: `${progressWidth} 100%`,
        }}
      >
        <TableCell className="p-0 whitespace-normal align-top">
          <div className="max-w-[18rem] px-3 py-2 leading-5 whitespace-normal break-words">
            {row.pathname || "/"}
          </div>
        </TableCell>
        <TableCell className="p-0 text-right align-top">
          <div className="px-3 py-2 font-mono tabular-nums">
            {numberFormat(locale, row.samples)}
          </div>
        </TableCell>
        <TableCell className="p-0 text-right align-top">
          <div className="px-3 py-2 font-mono tabular-nums">
            {formatPanelValue(locale, messages, activePanel, row.value)}
          </div>
        </TableCell>
      </AnimatedDataTableRow>
    );
  });

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3 px-4 py-4">
        <div className="min-w-0 space-y-1">
          <div className={cn("flex items-center gap-2 font-medium", statusStyle.labelClassName)}>
            <StatusIcon className="size-4" />
            {statusLabel(messages, status)}
          </div>
          <div className="text-xs text-muted-foreground">
            {pathStatusRangeLabel(locale, messages, activePanel, status)}
          </div>
        </div>
        <div className="font-mono text-sm text-muted-foreground tabular-nums">
          {numberFormat(locale, rows.length)}
        </div>
      </div>
      <div className="pb-4">
        <DataTableSwitch
          loading={false}
          hasContent={rows.length > 0}
          loadingLabel={messages.common.loading}
          emptyLabel={messages.common.noData}
          colSpan={3}
          contentKey={`${activePanel}-${status}-${sort.key}-${sort.direction}-${rows.length}`}
          header={header}
          rows={renderedRows}
        />
      </div>
    </div>
  );
}

function PathPerformanceTable({
  locale,
  messages,
  activePanel,
  rows,
}: {
  locale: Locale;
  messages: AppMessages;
  activePanel: PerformancePanelKey;
  rows: PathPerformanceRow[];
}) {
  const [sort, setSort] = useState<{ key: PathSortKey; direction: SortDirection }>({
    key: "samples",
    direction: "desc",
  });
  const sortedRows = useMemo(() => {
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "samples") return (a.samples - b.samples) * direction;
      if (sort.key === "score") {
        return ((a.score ?? -1) - (b.score ?? -1)) * direction;
      }
      return ((a.value ?? -1) - (b.value ?? -1)) * direction;
    });
  }, [rows, sort.direction, sort.key]);
  const maxSamples = Math.max(1, ...sortedRows.map((row) => row.samples));
  const groupedRows = useMemo(
    () => ({
      poor: sortedRows.filter((row) => row.status === "poor"),
      "needs-improvement": sortedRows.filter(
        (row) => row.status === "needs-improvement",
      ),
      great: sortedRows.filter((row) => row.status === "great"),
    }),
    [sortedRows],
  );

  const updateSort = (key: PathSortKey) => {
    setSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : { key, direction: "desc" },
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="inline-flex items-center gap-2">
              <RiRouteLine className="size-4 text-muted-foreground" />
              {messages.performance.pathsTitle}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {panelLabel(messages, activePanel)}
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {messages.performance.pathsAnalyzedLabel}:{" "}
            {numberFormat(locale, rows.length)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid min-h-[18rem] divide-y divide-border/70 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {(["poor", "needs-improvement", "great"] as const).map((status) => (
            <PathStatusColumn
              key={status}
              locale={locale}
              messages={messages}
              activePanel={activePanel}
              status={status}
              rows={groupedRows[status]}
              maxSamples={maxSamples}
              sort={sort}
              onSort={updateSort}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
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
  const [activePanel, setActivePanel] = useState<PerformancePanelKey>("score");
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
      .catch(() => emptyPerformance(window.interval))
      .then((payload) => {
        if (!active) return;
        startTransition(() => {
          setPerformanceData(payload);
          setDataWindow({
            from: window.from,
            to: window.to,
            interval: window.interval,
          });
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
  }, [filters, siteId, window.from, window.interval, window.to]);

  const activeSummary = useMemo(() => {
    if (activePanel === "score") return scoreSummary(performanceData);
    return performanceData.summaries[activePanel] ?? EMPTY_SUMMARY;
  }, [activePanel, performanceData]);
  const activeValue = activeSummary.p75 ?? activeSummary.avg;

  const chartPoints = useMemo(
    () =>
      activePanel === "score"
        ? buildScoreTrend(performanceData, dataWindow)
        : buildMetricTrend(performanceData, activePanel, dataWindow),
    [activePanel, dataWindow, performanceData],
  );

  const metricCards = useMemo<MetricCardModel[]>(() => {
    const summaryByPanel = new Map<PerformancePanelKey, PerformanceSummary>(
      PERFORMANCE_PANELS.map((key) => [
        key,
        key === "score"
          ? scoreSummary(performanceData)
          : (performanceData.summaries[key] ?? EMPTY_SUMMARY),
      ]),
    );
    return PERFORMANCE_PANELS.map((key) => {
      const summary = summaryByPanel.get(key) ?? EMPTY_SUMMARY;
      const value = summary.p75 ?? summary.avg;
      const score = key === "score" ? value : metricScore(key, value);
      const status = key === "score" ? scoreStatus(value) : metricStatus(key, value);
      return {
        key,
        label: panelLabel(messages, key),
        valueLabel: formatPanelValue(locale, messages, key, value),
        value,
        status,
        score,
      };
    });
  }, [locale, messages, performanceData]);

  const pathRows = useMemo<PathPerformanceRow[]>(
    () =>
      (performanceData.routes ?? []).map((route) => {
        const value = routeValue(route, activePanel);
        const score = routeScore(route);
        return {
          pathname: route.pathname || "/",
          views: route.views ?? 0,
          samples: routeSamples(route, activePanel),
          value,
          score,
          status: routeStatus(route, activePanel),
        };
      }),
    [activePanel, performanceData.routes],
  );
  const countryRows = useMemo<CountryHealthRow[]>(
    () =>
      (performanceData.countries ?? [])
        .map((country) => {
          const value = countryValue(country, activePanel);
          const score = countryScore(country);
          const normalizedCountry = String(country.country ?? "").trim().toUpperCase();
          const { label, code } = resolveCountryLabel(
            normalizedCountry,
            locale,
            messages.common.unknown,
          );
          const flagCode = resolveCountryFlagCode(code, locale);
          return {
            country: normalizedCountry,
            label,
            iconName: flagCode ? `flagpack:${flagCode.toLowerCase()}` : null,
            views: country.views ?? 0,
            samples: countrySamples(country, activePanel),
            value,
            score,
            status: countryStatus(country, activePanel),
          };
        })
        .filter((country) => country.country.length > 0),
    [activePanel, locale, messages.common.unknown, performanceData.countries],
  );

  const hasContent =
    chartPoints.some((row) => row.samples > 0) ||
    metricCards.some((card) => card.valueLabel !== "--") ||
    pathRows.length > 0 ||
    countryRows.length > 0;

  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.performance.title}
        subtitle={messages.performance.subtitle}
      />

      <AutoTransition initial duration={0.22}>
        {loading && !hydrated ? (
          <div key="loading">
            <PerformanceSkeleton />
          </div>
        ) : hasContent ? (
          <div
            key="content"
            className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]"
          >
            <PerformanceRail
              activePanel={activePanel}
              cards={metricCards}
              onSelect={setActivePanel}
            />
            <div className="min-w-0 space-y-4">
              <MetricSummaryCard
                locale={locale}
                messages={messages}
                activePanel={activePanel}
                activeSummary={activeSummary}
                activeValue={activeValue}
                pathCount={pathRows.length}
              />
              <PerformanceTrendCard
                locale={locale}
                messages={messages}
                activePanel={activePanel}
                dataWindow={dataWindow}
                points={chartPoints}
              />
              <PerformanceHealthMapCard
                locale={locale}
                messages={messages}
                activePanel={activePanel}
                countries={countryRows}
              />
              <PathPerformanceTable
                locale={locale}
                messages={messages}
                activePanel={activePanel}
                rows={pathRows}
              />
            </div>
          </div>
        ) : (
          <div
            key="empty"
            className="flex min-h-[520px] items-center justify-center text-sm text-muted-foreground"
          >
            {messages.common.noData}
          </div>
        )}
      </AutoTransition>
    </div>
  );
}
