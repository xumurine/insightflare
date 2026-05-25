"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { RemixiconComponentType } from "@remixicon/react";
import {
  RiArrowDownSLine,
  RiArrowLeftLine,
  RiArrowUpSLine,
  RiDatabase2Line,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiFileList3Line,
  RiFilter3Line,
  RiPulseLine,
  RiSearchLine,
  RiStackLine,
} from "@remixicon/react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { AnimatedDataTableRow } from "@/components/dashboard/animated-data-table-row";
import { DataTableSwitch } from "@/components/dashboard/data-table-switch";
import {
  BrowserMeta,
  CountryRegionMeta,
  DeviceMeta,
  formatPath,
  formatRelativeTime,
  formatShortDateTime,
  OsMeta,
  ReferrerMeta,
  VisitorAvatar,
} from "@/components/dashboard/journey-display";
import { PageHeading } from "@/components/dashboard/page-heading";
import { DetailDrawer } from "@/components/dashboard/site-pages/detail-drawer";
import { AutoResizer } from "@/components/ui/auto-resizer";
import { AutoTransition } from "@/components/ui/auto-transition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildComplementaryOklchPalette } from "@/lib/dashboard/chart-colors";
import {
  fetchEventRecordDetail,
  fetchEventsRecords,
  fetchEventTypeDetail,
  fetchEventTypeFieldValues,
} from "@/lib/dashboard/client-data";
import {
  intlLocale,
  numberFormat,
  percentFormat,
} from "@/lib/dashboard/format";
import type {
  DashboardFilters,
  EventPayloadFilterRule,
  EventPayloadFilterValue,
  TimeWindow,
} from "@/lib/dashboard/query-state";
import type {
  EventField,
  EventFieldValueStat,
  EventRecord,
  EventRecordDetailData,
  EventsRecordsMeta,
  EventsTrendData,
  EventTrendSeries,
} from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { navigateWithTransition } from "@/lib/page-transition";
import { cn } from "@/lib/utils";

const EVENT_PAGE_SIZE = 80;
const EVENT_SKELETON_ROWS = 8;
const OTHER_SERIES_KEY = "other";
const FIELD_TREE_CHILD_TRANSITION = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};
const JSON_TREE_INDENT_REM = 1.25;
const JSON_TREE_GUIDE_OFFSET_REM = 0.58;
const JSON_TREE_ROW_CLASS =
  "flex min-w-max items-center gap-1.5 py-0.5 whitespace-nowrap";

const VisitorDetailClientPage = dynamic(
  () =>
    import("@/components/dashboard/site-pages/visitor-detail-client-page").then(
      (module) => module.VisitorDetailClientPage,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 text-sm text-muted-foreground">Loading...</div>
    ),
  },
);

const SessionDetailClientPage = dynamic(
  () =>
    import("@/components/dashboard/site-pages/session-detail-client-page").then(
      (module) => module.SessionDetailClientPage,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 text-sm text-muted-foreground">Loading...</div>
    ),
  },
);

type SortDirection = "asc" | "desc";
export type EventRecordSortKey = "occurredAt" | "eventName" | "pathname";

export interface EventRecordSortState {
  key: EventRecordSortKey;
  direction: SortDirection;
}

export type EventPageCopy = AppMessages["events"];

export const DEFAULT_EVENT_RECORD_SORT: EventRecordSortState = {
  key: "occurredAt",
  direction: "desc",
};

const INITIAL_EVENT_META: EventsRecordsMeta = {
  page: 1,
  pageSize: EVENT_PAGE_SIZE,
  returned: 0,
  hasMore: false,
  nextPage: null,
};

function shortId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 9)}...`;
}

function normalizeEventFieldPath(path: string): string {
  const normalized = String(path ?? "").trim();
  if (!normalized || normalized === "/") return "";
  return normalized.startsWith("/")
    ? normalized.replace(/\/+/g, "/")
    : `/${normalized.replace(/^\/+/, "")}`;
}

function eventFieldKey(field: Pick<EventField, "path" | "valueType">): string {
  return `${field.valueType}\u0000${normalizeEventFieldPath(field.path)}`;
}

function eventFieldValueKey(value: EventFieldValueStat["value"]): string {
  return JSON.stringify(value);
}

function formatFieldValueLabel(value: EventFieldValueStat["value"]): string {
  if (value === null) return "null";
  if (typeof value === "string") return value.length > 0 ? value : '""';
  return String(value);
}

function payloadFilterValueType(
  value: EventPayloadFilterValue,
): "string" | "number" | "boolean" | "null" {
  if (value === null) return "null";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function payloadFilterValuesEqual(
  left: EventPayloadFilterValue,
  right: EventPayloadFilterValue,
): boolean {
  if (typeof left === "number" || typeof right === "number") {
    return Number(left) === Number(right);
  }
  return left === right;
}

function normalizePayloadFilterInputPath(path: string): string {
  const normalized = path.trim().slice(0, 240);
  if (!normalized || normalized === "/") return "";
  if (normalized.startsWith("/")) return normalizeEventFieldPath(normalized);
  return normalizeEventFieldPath(
    normalized
      .replace(/^\$\.?/, "")
      .replace(/\[(?:\d+|\*)\]/g, ".*")
      .split(".")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join("/"),
  );
}

function formatPayloadFilterPathForInput(path: string): string {
  const normalized = normalizeEventFieldPath(path);
  if (!normalized) return "";
  return normalized.slice(1).split("/").filter(Boolean).join(".");
}

function formatPayloadFilterValueForInput(
  value: EventPayloadFilterValue,
): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "null";
  return String(value);
}

function formatPayloadFilterRules(rules: EventPayloadFilterRule[]): string {
  return rules
    .map(
      (rule) =>
        `${formatPayloadFilterPathForInput(rule.path)} ${
          rule.operator === "ne" ? "!=" : "=="
        } ${formatPayloadFilterValueForInput(rule.value)}`,
    )
    .join("\n");
}

function parsePayloadFilterValue(rawValue: string): EventPayloadFilterValue {
  const value = rawValue.trim();
  if (!value) throw new Error("Empty filter value");
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:\d+|\d*\.\d+)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    if (value.startsWith('"')) {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed !== "string") throw new Error("Invalid string value");
      return parsed;
    }
    return value.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  }
  return value.slice(0, 240);
}

function parsePayloadFilterInput(
  input: string,
): { ok: true; rules: EventPayloadFilterRule[] } | { ok: false } {
  const conditions = input
    .split(/\n|&&/g)
    .map((condition) => condition.trim())
    .filter(Boolean);
  const rules: EventPayloadFilterRule[] = [];

  try {
    for (const condition of conditions) {
      const match = condition.match(/^(.+?)\s*(==|!=)\s*(.+)$/);
      if (!match) return { ok: false };
      const path = normalizePayloadFilterInputPath(match[1] ?? "");
      if (!path) return { ok: false };
      const value = parsePayloadFilterValue(match[3] ?? "");
      rules.push({
        path,
        operator: match[2] === "!=" ? "ne" : "eq",
        value,
      });
    }
  } catch {
    return { ok: false };
  }

  return { ok: true, rules };
}

function isPayloadFilterActive(
  rules: EventPayloadFilterRule[],
  path: string,
  value: EventPayloadFilterValue,
): boolean {
  const normalizedPath = normalizeEventFieldPath(path);
  return rules.some(
    (rule) =>
      rule.operator === "eq" &&
      normalizeEventFieldPath(rule.path) === normalizedPath &&
      payloadFilterValueType(rule.value) === payloadFilterValueType(value) &&
      payloadFilterValuesEqual(rule.value, value),
  );
}

function PayloadFilterActiveCountBadge({ count }: { count: number }) {
  const hasCount = count > 0;
  return (
    <AutoResizer
      initial
      animateWidth
      animateHeight={false}
      className="inline-flex shrink-0 items-center"
    >
      <AutoTransition
        className="inline-block"
        duration={0.2}
        type="fade"
        initial={false}
        presenceMode="wait"
        customVariants={{
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
        }}
      >
        {hasCount ? (
          <span
            key={`payload-filter-count-${count}`}
            className="inline-flex min-w-5 items-center justify-center rounded-full border border-primary/40 bg-primary/15 px-1.5 text-[11px] leading-4 font-semibold text-primary"
          >
            {count}
          </span>
        ) : (
          <span
            key="payload-filter-count-empty"
            className="inline-flex w-0 overflow-hidden"
            aria-hidden
          />
        )}
      </AutoTransition>
    </AutoResizer>
  );
}

function PayloadFilterButton({
  labels,
  count,
  onClick,
}: {
  labels: EventPageCopy;
  count: number;
  onClick: () => void;
}) {
  const hasActiveFilters = count > 0;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "gap-2 transition-colors",
        hasActiveFilters &&
          "!border-primary/60 !bg-primary/10 !text-primary hover:!bg-primary/15 hover:!text-primary aria-expanded:!bg-primary/15 dark:!border-primary/60 dark:!bg-primary/20 dark:hover:!bg-primary/25",
      )}
      style={
        hasActiveFilters
          ? {
              borderColor: "hsl(var(--primary) / 0.6)",
              backgroundColor: "hsl(var(--primary) / 0.12)",
              color: "hsl(var(--primary))",
            }
          : undefined
      }
      onClick={onClick}
    >
      <RiFilter3Line className="size-4" />
      {labels.payloadFilter}
      <PayloadFilterActiveCountBadge count={count} />
    </Button>
  );
}

interface EventFieldTreeNode {
  path: string;
  segment: string;
  fields: EventField[];
  children: EventFieldTreeNode[];
}

function createEventFieldTreeNode(
  path: string,
  segment: string,
): EventFieldTreeNode {
  return {
    path,
    segment,
    fields: [],
    children: [],
  };
}

function buildEventFieldTree(fields: EventField[]): EventFieldTreeNode {
  const root = createEventFieldTreeNode("", "");
  const childMaps = new Map<
    EventFieldTreeNode,
    Map<string, EventFieldTreeNode>
  >();

  const ensureChild = (
    parent: EventFieldTreeNode,
    segment: string,
    path: string,
  ): EventFieldTreeNode => {
    let childMap = childMaps.get(parent);
    if (!childMap) {
      childMap = new Map();
      childMaps.set(parent, childMap);
    }
    const existing = childMap.get(segment);
    if (existing) return existing;
    const child = createEventFieldTreeNode(path, segment);
    childMap.set(segment, child);
    parent.children.push(child);
    return child;
  };

  for (const field of fields) {
    const normalizedPath = normalizeEventFieldPath(field.path);
    if (!normalizedPath) {
      root.fields.push(field);
      continue;
    }

    const segments = normalizedPath.split("/").filter(Boolean);
    let parent = root;
    let currentPath = "";
    for (const segment of segments) {
      currentPath = `${currentPath}/${segment}`;
      parent = ensureChild(parent, segment, currentPath);
    }
    parent.fields.push(field);
  }

  return root;
}

function collectEventFieldTreeExpansionKeys(
  node: EventFieldTreeNode,
  keys = new Set<string>(),
): Set<string> {
  if (node.children.length > 0 || node.path === "") {
    keys.add(node.path || "/");
  }
  for (const child of node.children) {
    collectEventFieldTreeExpansionKeys(child, keys);
  }
  return keys;
}

function formatEventFieldKeySegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function tickDateFormat(
  localeCode: string,
  interval: TimeWindow["interval"],
  timeZone: string,
): Intl.DateTimeFormat {
  if (interval === "minute" || interval === "hour") {
    return new Intl.DateTimeFormat(localeCode, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (interval === "month") {
    return new Intl.DateTimeFormat(localeCode, {
      timeZone,
      year: "numeric",
      month: "short",
    });
  }
  return new Intl.DateTimeFormat(localeCode, {
    timeZone,
    month: "short",
    day: "numeric",
  });
}

function tooltipDateFormat(
  localeCode: string,
  interval: TimeWindow["interval"],
  timeZone: string,
): Intl.DateTimeFormat {
  if (interval === "minute" || interval === "hour") {
    return new Intl.DateTimeFormat(localeCode, {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (interval === "month") {
    return new Intl.DateTimeFormat(localeCode, {
      timeZone,
      year: "numeric",
      month: "long",
    });
  }
  return new Intl.DateTimeFormat(localeCode, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function eventSeriesLabel(series: EventTrendSeries, labels: EventPageCopy) {
  return series.isOther ? labels.other : series.label || series.eventName;
}

function EventMetricCell({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: RemixiconComponentType;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 bg-card p-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex shrink-0 items-center justify-center text-muted-foreground">
          <Icon className="size-[11px]" />
        </span>
        <p className="min-w-0 truncate text-[11px] uppercase text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-3 min-w-0 truncate font-mono text-xl leading-7 font-semibold text-foreground">
        {value}
      </p>
      <p className="mt-3 min-w-0 truncate text-[11px] leading-[14px] text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

export function EventMetricGrid({
  locale,
  labels,
  summary,
  includeShare,
}: {
  locale: Locale;
  labels: EventPageCopy;
  summary: {
    events: number;
    eventTypes: number;
    sessions: number;
    visitors: number;
    avgEventsPerSession: number;
    shareOfAllEvents?: number;
  };
  includeShare?: boolean;
}) {
  const average = numberFormat(
    locale,
    Number(summary.avgEventsPerSession || 0),
  );
  const share =
    includeShare && summary.shareOfAllEvents !== undefined
      ? percentFormat(locale, summary.shareOfAllEvents)
      : null;

  return (
    <Card className="py-0">
      <CardContent className="p-0">
        <div className="grid gap-px overflow-hidden bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
          <EventMetricCell
            icon={RiPulseLine}
            label={labels.totalEvents}
            value={numberFormat(locale, summary.events)}
            detail={
              share
                ? `${labels.shareOfAllEvents}: ${share}`
                : labels.detailSubtitle
            }
          />
          <EventMetricCell
            icon={RiStackLine}
            label={labels.eventTypes}
            value={numberFormat(locale, summary.eventTypes)}
            detail={labels.breakdownTitle}
          />
          <EventMetricCell
            icon={RiFileList3Line}
            label={labels.sessions}
            value={numberFormat(locale, summary.sessions)}
            detail={`${labels.avgEventsPerSession}: ${average}`}
          />
          <EventMetricCell
            icon={RiDatabase2Line}
            label={labels.visitors}
            value={numberFormat(locale, summary.visitors)}
            detail={labels.recordsTitle}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function EventTrendStackedBarCard({
  locale,
  labels,
  trend,
  window: timeWindow,
  title,
  loading,
  onSelectEvent,
}: {
  locale: Locale;
  labels: EventPageCopy;
  trend:
    | EventsTrendData
    | { series: EventTrendSeries[]; data: EventsTrendData["data"] };
  window: TimeWindow;
  title: string;
  loading?: boolean;
  onSelectEvent?: (eventName: string) => void;
}) {
  const localeCode = intlLocale(locale);
  const axisTickFormatter = useMemo(
    () => tickDateFormat(localeCode, timeWindow.interval, timeWindow.timeZone),
    [localeCode, timeWindow.interval, timeWindow.timeZone],
  );
  const tooltipFormatter = useMemo(
    () =>
      tooltipDateFormat(localeCode, timeWindow.interval, timeWindow.timeZone),
    [localeCode, timeWindow.interval, timeWindow.timeZone],
  );
  const series = useMemo(() => {
    const palette = buildComplementaryOklchPalette(
      trend.series.filter((item) => !item.isOther).length,
    );
    let paletteIndex = 0;

    return trend.series.map((item) => {
      if (item.isOther) {
        return {
          ...item,
          displayLabel: eventSeriesLabel(item, labels),
          color: "var(--muted-foreground)",
        };
      }

      const color =
        palette[paletteIndex] ?? palette[palette.length - 1] ?? "#2dd4bf";
      paletteIndex += 1;

      return {
        ...item,
        displayLabel: eventSeriesLabel(item, labels),
        color,
      };
    });
  }, [labels, trend.series]);
  const chartConfig = useMemo(
    () =>
      series.reduce((config, item) => {
        config[item.key] = {
          label: item.displayLabel,
          color: item.color,
        };
        return config;
      }, {} as ChartConfig),
    [series],
  );
  const chartData = useMemo(
    () =>
      trend.data.map((point) => {
        const row: Record<string, number> = {
          timestampMs: point.timestampMs,
          totalEvents: point.totalEvents,
        };
        for (const item of series) {
          row[item.key] = Number(point.eventsBySeries[item.key] ?? 0);
        }
        return row;
      }),
    [series, trend.data],
  );
  const hasContent = series.length > 0 && chartData.length > 0;

  const selectSeries = (item: EventTrendSeries) => {
    if (item.isOther || item.key === OTHER_SERIES_KEY) return;
    onSelectEvent?.(item.eventName);
  };

  return (
    <Card className="overflow-visible">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <CardTitle>{title}</CardTitle>
          <div className="flex flex-wrap gap-2">
            {series.map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={item.isOther || !onSelectEvent}
                className={cn(
                  "inline-flex h-6 max-w-48 items-center gap-1.5 border px-2 text-xs transition-colors",
                  item.isOther || !onSelectEvent
                    ? "cursor-default text-muted-foreground"
                    : "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                )}
                title={item.displayLabel}
                onClick={() => selectSeries(item)}
              >
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate">{item.displayLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative min-h-[320px]">
          {loading && !hasContent ? (
            <div className="space-y-4">
              <Skeleton className="h-[280px] w-full" />
              <div className="flex flex-wrap justify-center gap-2">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-5 w-20" />
                ))}
              </div>
            </div>
          ) : !hasContent ? (
            <div className="flex h-[320px] items-center justify-center text-muted-foreground">
              {labels.empty}
            </div>
          ) : (
            <ChartContainer
              className="h-[320px] w-full aspect-auto"
              config={chartConfig}
            >
              <BarChart
                accessibilityLayer
                data={chartData}
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
                    numberFormat(locale, Number(value ?? 0))
                  }
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      className="min-w-[16rem]"
                      indicator="line"
                      labelFormatter={(value, payload) => {
                        const timestamp = Number(
                          payload?.[0]?.payload?.timestampMs ?? value ?? 0,
                        );
                        return tooltipFormatter.format(new Date(timestamp));
                      }}
                      formatter={(value, name, _item, _index, payload) => {
                        const row = payload as unknown as Record<
                          string,
                          number
                        >;
                        const seriesKey = String(name ?? "");
                        const numeric = Math.max(
                          0,
                          Number(row[seriesKey] ?? value ?? 0),
                        );
                        const currentSeries = series.find(
                          (item) => item.key === seriesKey,
                        );
                        return (
                          <div className="flex w-full items-center gap-3">
                            <span className="inline-flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                                style={{
                                  backgroundColor: currentSeries?.color,
                                }}
                              />
                              <span
                                className="truncate text-muted-foreground"
                                title={currentSeries?.displayLabel ?? seriesKey}
                              >
                                {currentSeries?.displayLabel ?? seriesKey}
                              </span>
                            </span>
                            <span className="ml-auto shrink-0 whitespace-nowrap text-right font-mono text-foreground tabular-nums">
                              {numberFormat(locale, numeric)}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                {series.map((item) => (
                  <Bar
                    key={item.key}
                    dataKey={item.key}
                    stackId="events"
                    fill={`var(--color-${item.key})`}
                    radius={0}
                    isAnimationActive
                    onClick={() => selectSeries(item)}
                    className={cn(
                      item.isOther || !onSelectEvent ? "" : "cursor-pointer",
                    )}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          )}

          <AutoTransition
            type="fade"
            duration={0.2}
            className="pointer-events-none absolute right-2 top-2"
          >
            {loading && hasContent ? (
              <span
                key="event-trend-loading"
                className="inline-flex items-center gap-2 border border-border/50 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm"
              >
                <Spinner className="size-3.5" />
                {labels.loading}
              </span>
            ) : (
              <div key="event-trend-idle" className="h-0 w-0 overflow-hidden" />
            )}
          </AutoTransition>
        </div>
      </CardContent>
    </Card>
  );
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (active) {
    return direction === "desc" ? (
      <RiArrowDownSLine className="size-3.5" />
    ) : (
      <RiArrowUpSLine className="size-3.5" />
    );
  }
  return (
    <span className="inline-flex flex-col leading-none text-muted-foreground">
      <RiArrowUpSLine className="-mb-1 size-3.5" />
      <RiArrowDownSLine className="-mt-1 size-3.5" />
    </span>
  );
}

function SortHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <TableHead
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={onClick}
      >
        {label}
        <SortIndicator active={active} direction={direction} />
      </button>
    </TableHead>
  );
}

function EventRowSkeleton({
  index,
  sentinelRef,
}: {
  index: number;
  sentinelRef?: (node: HTMLTableRowElement | null) => void;
}) {
  const widths = [
    "w-24",
    "w-28",
    "w-24",
    "w-28",
    "w-32",
    "w-40",
    "w-24",
    "w-28",
    "w-24",
    "w-24",
    "w-20",
  ];
  return (
    <TableRow ref={sentinelRef} aria-hidden="true">
      {widths.map((width, cellIndex) => (
        <TableCell
          key={`${index}-${cellIndex}`}
          className={cellIndex === 0 ? "pl-4" : undefined}
        >
          <Skeleton className={cn("h-4", width)} />
        </TableCell>
      ))}
    </TableRow>
  );
}

function appendUniqueEvents(
  current: EventRecord[],
  incoming: EventRecord[],
): EventRecord[] {
  if (current.length === 0) return incoming;
  const seen = new Set(current.map((row) => row.eventId));
  const nextRows = incoming.filter((row) => !seen.has(row.eventId));
  return nextRows.length > 0 ? [...current, ...nextRows] : current;
}

function EventRecordsTable({
  locale,
  messages,
  labels,
  rows,
  sort,
  onSort,
  onOpenRecord,
  loadingRows,
  loadingMore,
  error,
  appendError,
  hasMore,
  sentinelRef,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: EventPageCopy;
  rows: EventRecord[];
  sort: EventRecordSortState;
  onSort: (key: EventRecordSortKey) => void;
  onOpenRecord: (eventId: string) => void;
  loadingRows: boolean;
  loadingMore: boolean;
  error: boolean;
  appendError: boolean;
  hasMore: boolean;
  sentinelRef?: (node: HTMLTableRowElement | null) => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const handleKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    eventId: string,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpenRecord(eventId);
  };

  const bodyState = loadingRows
    ? "loading"
    : error
      ? "error"
      : rows.length === 0 && !hasMore
        ? "empty"
        : "rows";

  return (
    <Card className="py-0">
      <CardContent className="px-0">
        <Table className="min-w-[92rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">{labels.visitor}</TableHead>
              <SortHeader
                label={labels.eventName}
                active={sort.key === "eventName"}
                direction={sort.direction}
                onClick={() => onSort("eventName")}
              />
              <TableHead>{labels.eventId}</TableHead>
              <SortHeader
                label={labels.occurredAt}
                active={sort.key === "occurredAt"}
                direction={sort.direction}
                onClick={() => onSort("occurredAt")}
              />
              <SortHeader
                label={labels.page}
                active={sort.key === "pathname"}
                direction={sort.direction}
                onClick={() => onSort("pathname")}
              />
              <TableHead>{labels.referrer}</TableHead>
              <TableHead>{labels.location}</TableHead>
              <TableHead>{labels.os}</TableHead>
              <TableHead>{labels.browser}</TableHead>
              <TableHead>{labels.device}</TableHead>
              <TableHead className="pr-4 text-right">
                {labels.payload}
              </TableHead>
            </TableRow>
          </TableHeader>
          <AutoTransition
            as="tbody"
            transitionKey={bodyState}
            initial={false}
            duration={0.18}
            type="fade"
            presenceMode="wait"
            aria-busy={loadingRows || loadingMore}
            data-slot="table-body"
            className="[&_tr:last-child]:border-0"
          >
            {loadingRows ? (
              Array.from({ length: EVENT_SKELETON_ROWS }, (_, index) => (
                <EventRowSkeleton key={index} index={index} />
              ))
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={11}
                  className="h-28 text-center text-muted-foreground"
                >
                  {labels.loadError}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 && !hasMore ? (
              <TableRow>
                <TableCell
                  colSpan={11}
                  className="h-28 text-center text-muted-foreground"
                >
                  {labels.empty}
                </TableCell>
              </TableRow>
            ) : (
              <>
                {rows.map((row) => (
                  <TableRow
                    key={row.eventId}
                    role="button"
                    tabIndex={0}
                    className="group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    onClick={() => onOpenRecord(row.eventId)}
                    onKeyDown={(event) => handleKeyDown(event, row.eventId)}
                  >
                    <TableCell className="pl-4">
                      <div className="flex w-28 items-center gap-2">
                        <VisitorAvatar
                          seed={row.visitorId || row.eventId}
                          className="size-6"
                        />
                        <span className="truncate font-mono">
                          {shortId(
                            row.visitorId || row.sessionId || row.visitId,
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-48">
                      <span
                        className="truncate font-medium"
                        title={row.eventName}
                      >
                        {row.eventName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-muted-foreground">
                        {shortId(row.eventId)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {formatRelativeTime(locale, row.occurredAt, now)}
                    </TableCell>
                    <TableCell className="max-w-64">
                      <span
                        className="truncate font-mono"
                        title={formatPath(row.pathname)}
                      >
                        {formatPath(row.pathname)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-44">
                      <ReferrerMeta
                        referrerHost={row.referrerHost || ""}
                        directLabel={messages.overview.direct}
                      />
                    </TableCell>
                    <TableCell className="max-w-52">
                      <CountryRegionMeta
                        locale={locale}
                        messages={messages}
                        country={row.country || ""}
                        region={row.region}
                      />
                    </TableCell>
                    <TableCell className="max-w-40">
                      <OsMeta
                        os={row.os || ""}
                        version={row.osVersion}
                        unknownLabel={messages.common.unknown}
                      />
                    </TableCell>
                    <TableCell className="max-w-40">
                      <BrowserMeta
                        browser={row.browser || ""}
                        version={row.browserVersion}
                        unknownLabel={messages.common.unknown}
                      />
                    </TableCell>
                    <TableCell className="max-w-36">
                      <DeviceMeta
                        deviceType={row.deviceType || ""}
                        deviceLabels={messages.common.deviceLabels}
                        unknownLabel={messages.common.unknown}
                      />
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono tabular-nums">
                      {numberFormat(locale, row.valueCount)}
                    </TableCell>
                  </TableRow>
                ))}
                {appendError ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="h-16 text-center text-muted-foreground"
                    >
                      {labels.loadError}
                    </TableCell>
                  </TableRow>
                ) : hasMore ? (
                  Array.from({ length: EVENT_SKELETON_ROWS }, (_, index) => (
                    <EventRowSkeleton
                      key={`append-${rows.length}-${index}`}
                      index={index}
                      sentinelRef={index === 0 ? sentinelRef : undefined}
                    />
                  ))
                ) : null}
              </>
            )}
          </AutoTransition>
        </Table>
      </CardContent>
    </Card>
  );
}

function ScalarValue({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="text-muted-foreground">null</span>;
  }
  if (typeof value === "string") {
    return (
      <span className="font-medium text-primary">{JSON.stringify(value)}</span>
    );
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="font-medium text-primary">{String(value)}</span>;
  }
  return null;
}

function jsonTreeIndentStyle(depth: number) {
  return { paddingLeft: `${depth * JSON_TREE_INDENT_REM}rem` };
}

function jsonTreeGuideStyle(depth: number) {
  return {
    left: `${depth * JSON_TREE_INDENT_REM - JSON_TREE_GUIDE_OFFSET_REM}rem`,
  };
}

function JsonTree({
  value,
  depth = 0,
  labels,
  label,
}: {
  value: unknown;
  depth?: number;
  labels: EventPageCopy;
  label?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);

  if (value === null || typeof value !== "object") {
    return (
      <div className={JSON_TREE_ROW_CLASS} style={jsonTreeIndentStyle(depth)}>
        {label ? (
          <span className="shrink-0 text-muted-foreground">{label}</span>
        ) : null}
        <ScalarValue value={value} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>);
  const itemCount = entries.length;
  const openToken = isArray ? "[" : "{";
  const closeToken = isArray ? "]" : "}";

  if (itemCount === 0) {
    return (
      <div className={JSON_TREE_ROW_CLASS} style={jsonTreeIndentStyle(depth)}>
        {label ? (
          <span className="shrink-0 text-muted-foreground">{label}</span>
        ) : null}
        <span className="text-muted-foreground">{`${openToken}${closeToken}`}</span>
      </div>
    );
  }

  const toggle = () => setExpanded((current) => !current);

  return (
    <div className="min-w-max space-y-1">
      <div className={JSON_TREE_ROW_CLASS} style={jsonTreeIndentStyle(depth)}>
        {label ? (
          <span className="shrink-0 text-muted-foreground">{label}</span>
        ) : null}
        <span className="text-muted-foreground">{openToken}</span>
        <span className="font-medium text-primary">{itemCount}</span>
        <span className="text-muted-foreground">{closeToken}</span>
        <button
          type="button"
          className="group inline-flex size-4 shrink-0 items-center justify-center rounded-none text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
          onClick={toggle}
          aria-label={expanded ? labels.collapseField : labels.expandField}
          title={expanded ? labels.collapseField : labels.expandField}
        >
          <RiArrowDownSLine
            className={cn(
              "size-3.5 text-primary transition-transform duration-200 ease-out",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
      </div>
      <AutoResizer duration={0.2} ease={[0.22, 1, 0.36, 1]}>
        <AutoTransition
          initial={false}
          transitionKey={expanded ? "expanded" : "collapsed"}
          customVariants={FIELD_TREE_CHILD_TRANSITION}
          presenceMode="sync"
        >
          {expanded ? (
            <div className="relative space-y-1">
              <span
                className="absolute top-0 bottom-0 border-l border-border/70"
                style={jsonTreeGuideStyle(depth + 1)}
                aria-hidden
              />
              {entries.map(([key, child]) => (
                <JsonTree
                  key={key}
                  value={child}
                  depth={depth + 1}
                  labels={labels}
                  label={
                    isArray ? (
                      <span>[{key}]</span>
                    ) : (
                      <span>{JSON.stringify(key)}:</span>
                    )
                  }
                />
              ))}
            </div>
          ) : null}
        </AutoTransition>
      </AutoResizer>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}

function isInsideDetailDrawer(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("[data-detail-drawer-root]") !== null
  );
}

export function EventRecordDetailDrawer({
  locale,
  messages,
  labels,
  siteId,
  pathname,
  open,
  onOpenChange,
  detail,
  loading,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: EventPageCopy;
  siteId: string;
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: EventRecordDetailData["data"] | null;
  loading: boolean;
}) {
  const [nestedDetail, setNestedDetail] = useState<{
    kind: "visitor" | "session";
    id: string;
  } | null>(null);
  const basePath = pathname.replace(/\/events(?:\/detail)?$/, "");
  const visitorId = detail?.context.visitorId?.trim() || "";
  const sessionId = detail?.context.sessionId?.trim() || "";
  const visitorPathname = `${basePath}/visitors`;
  const sessionPathname = `${basePath}/sessions`;
  const nestedDetailOpen = nestedDetail !== null;

  useEffect(() => {
    if (!open) setNestedDetail(null);
  }, [open]);

  const openVisitorDetail = (nextVisitorId: string) => {
    const normalizedVisitorId = nextVisitorId.trim();
    if (!normalizedVisitorId) return;
    setNestedDetail({ kind: "visitor", id: normalizedVisitorId });
  };

  const openSessionDetail = (nextSessionId: string) => {
    const normalizedSessionId = nextSessionId.trim();
    if (!normalizedSessionId) return;
    setNestedDetail({ kind: "session", id: normalizedSessionId });
  };

  const copyPayloadJson = async () => {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(detail.eventData, null, 2),
      );
      toast.success(labels.copiedJson);
    } catch {
      toast.error(labels.copyJsonFailed);
    }
  };
  const sideDrawerOverlay =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-hidden="true"
            data-event-record-drawer-overlay=""
            className="pointer-events-auto fixed inset-0 z-[1099] bg-black/10 supports-backdrop-filter:backdrop-blur-xs"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!nestedDetailOpen) onOpenChange(false);
            }}
          />,
          document.body,
        )
      : null;

  return (
    <>
      {sideDrawerOverlay}
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        direction="right"
        modal={false}
      >
        <DrawerContent
          className="z-[1100] !w-full !max-w-none sm:!w-[min(58vw,34rem)]"
          overlayClassName="hidden"
          onEscapeKeyDown={(event) => {
            if (nestedDetailOpen) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (isInsideDetailDrawer(event.detail.originalEvent.target)) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (isInsideDetailDrawer(event.detail.originalEvent.target)) {
              event.preventDefault();
            }
          }}
          onPointerDownOutside={(event) => {
            if (isInsideDetailDrawer(event.detail.originalEvent.target)) {
              event.preventDefault();
            }
          }}
        >
          <DrawerHeader className="border-b">
            <DrawerTitle>{labels.detailTitle}</DrawerTitle>
            <DrawerDescription>
              {detail?.event.eventName || labels.detailSubtitle}
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : !detail ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                {labels.empty}
              </div>
            ) : (
              <div className="space-y-5">
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{detail.event.eventName}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {detail.event.eventId}
                    </span>
                  </div>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <DetailItem
                      label={labels.occurredAt}
                      value={formatShortDateTime(
                        locale,
                        detail.event.occurredAt,
                        undefined,
                      )}
                    />
                    <DetailItem
                      label={labels.receivedAt}
                      value={formatShortDateTime(
                        locale,
                        detail.event.receivedAt,
                        undefined,
                      )}
                    />
                    <DetailItem
                      label={labels.visit}
                      value={
                        <span className="font-mono">
                          {shortId(detail.context.visitId)}
                        </span>
                      }
                    />
                    <DetailItem
                      label={labels.payloadFields}
                      value={`${numberFormat(locale, detail.event.nodeCount)} ${labels.nodes} / ${numberFormat(locale, detail.event.valueCount)} ${labels.values}`}
                    />
                  </dl>
                </section>

                <Separator />

                <section className="space-y-3">
                  <h3 className="text-sm font-medium">{labels.context}</h3>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <DetailItem
                      label={labels.page}
                      value={
                        <div className="min-w-0">
                          <div className="truncate font-mono">
                            {formatPath(detail.context.pathname)}
                          </div>
                          {detail.context.title ? (
                            <div className="truncate text-muted-foreground">
                              {detail.context.title}
                            </div>
                          ) : null}
                        </div>
                      }
                    />
                    <DetailItem
                      label={labels.referrer}
                      value={
                        <ReferrerMeta
                          referrerHost={detail.context.referrerHost || ""}
                          directLabel={messages.overview.direct}
                        />
                      }
                    />
                    <DetailItem
                      label={labels.location}
                      value={
                        <CountryRegionMeta
                          locale={locale}
                          messages={messages}
                          country={detail.context.country || ""}
                          region={detail.context.region}
                        />
                      }
                    />
                    <DetailItem
                      label={labels.browser}
                      value={
                        <BrowserMeta
                          browser={detail.context.browser || ""}
                          version={detail.context.browserVersion}
                          unknownLabel={messages.common.unknown}
                        />
                      }
                    />
                    <DetailItem
                      label={labels.os}
                      value={
                        <OsMeta
                          os={detail.context.os || ""}
                          version={detail.context.osVersion}
                          unknownLabel={messages.common.unknown}
                        />
                      }
                    />
                    <DetailItem
                      label={labels.device}
                      value={
                        <DeviceMeta
                          deviceType={detail.context.deviceType || ""}
                          deviceLabels={messages.common.deviceLabels}
                          unknownLabel={messages.common.unknown}
                        />
                      }
                    />
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!visitorId}
                      onClick={() => openVisitorDetail(visitorId)}
                    >
                      <RiExternalLinkLine data-icon="inline-start" />
                      {labels.openVisitor}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!sessionId}
                      onClick={() => openSessionDetail(sessionId)}
                    >
                      <RiExternalLinkLine data-icon="inline-start" />
                      {labels.openSession}
                    </Button>
                  </div>
                </section>

                <Separator />

                <section className="space-y-3">
                  <h3 className="text-sm font-medium">{labels.payload}</h3>
                  <div className="overflow-x-auto border bg-muted/20 p-3 font-mono text-xs leading-relaxed">
                    <JsonTree value={detail.eventData} labels={labels} />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void copyPayloadJson();
                      }}
                    >
                      <RiFileCopyLine data-icon="inline-start" />
                      {labels.copyJson}
                    </Button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {nestedDetail?.kind === "visitor" ? (
        <DetailDrawer
          ariaLabel={messages.visitors.title}
          drawerKey={`event-visitor:${nestedDetail.id}`}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setNestedDetail(null);
          }}
          zIndex={1200}
        >
          <VisitorDetailClientPage
            locale={locale}
            messages={messages}
            siteId={siteId}
            pathname={visitorPathname}
            visitorId={nestedDetail.id}
            onOpenSession={openSessionDetail}
          />
        </DetailDrawer>
      ) : null}

      {nestedDetail?.kind === "session" ? (
        <DetailDrawer
          ariaLabel={messages.sessionDetail.visitDetailsTitle}
          drawerKey={`event-session:${nestedDetail.id}`}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setNestedDetail(null);
          }}
          zIndex={1200}
        >
          <SessionDetailClientPage
            locale={locale}
            messages={messages}
            siteId={siteId}
            pathname={sessionPathname}
            sessionId={nestedDetail.id}
            onOpenVisitor={openVisitorDetail}
          />
        </DetailDrawer>
      ) : null}
    </>
  );
}

export function EventRecordsSection({
  locale,
  messages,
  labels,
  siteId,
  pathname,
  window: timeWindow,
  filters,
  eventName,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: EventPageCopy;
  siteId: string;
  pathname: string;
  window: TimeWindow;
  filters: DashboardFilters;
  eventName?: string;
}) {
  const [rows, setRows] = useState<EventRecord[]>([]);
  const [meta, setMeta] = useState<EventsRecordsMeta>(INITIAL_EVENT_META);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [appendError, setAppendError] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<EventRecordSortState>(
    DEFAULT_EVENT_RECORD_SORT,
  );
  const [sentinelNode, setSentinelNode] = useState<HTMLTableRowElement | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [detail, setDetail] = useState<EventRecordDetailData["data"] | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const latestRequestKeyRef = useRef("");
  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const requestKey = useMemo(
    () =>
      [
        siteId,
        timeWindow.from,
        timeWindow.to,
        timeWindow.interval,
        timeWindow.timeZone,
        filtersKey,
        debouncedQuery,
        sort.key,
        sort.direction,
        eventName ?? "",
      ].join(":"),
    [
      debouncedQuery,
      eventName,
      filtersKey,
      siteId,
      sort.direction,
      sort.key,
      timeWindow.from,
      timeWindow.interval,
      timeWindow.timeZone,
      timeWindow.to,
    ],
  );
  const replacingRows =
    loadingInitial || latestRequestKeyRef.current !== requestKey;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const loadPage = useEffectEvent(
    async (page: number, mode: "replace" | "append") => {
      const capturedRequestKey = latestRequestKeyRef.current;
      if (mode === "replace") {
        setLoadingInitial(true);
        setError(false);
        setAppendError(false);
      } else {
        setLoadingMore(true);
        setAppendError(false);
      }

      try {
        const payload = await fetchEventsRecords(siteId, timeWindow, filters, {
          page,
          pageSize: EVENT_PAGE_SIZE,
          sortBy: sort.key,
          sortDir: sort.direction,
          search: debouncedQuery,
          eventName,
        });
        if (latestRequestKeyRef.current !== capturedRequestKey) return;
        setRows((current) =>
          mode === "append"
            ? appendUniqueEvents(current, payload.data)
            : payload.data,
        );
        setMeta(payload.meta);
        setError(false);
        setAppendError(false);
      } catch {
        if (latestRequestKeyRef.current !== capturedRequestKey) return;
        if (mode === "replace") {
          setRows([]);
          setMeta(INITIAL_EVENT_META);
          setError(true);
          setAppendError(false);
        } else {
          setAppendError(true);
        }
      } finally {
        if (latestRequestKeyRef.current === capturedRequestKey) {
          if (mode === "replace") {
            setLoadingInitial(false);
          } else {
            setLoadingMore(false);
          }
        }
      }
    },
  );

  const loadNextPage = useEffectEvent(() => {
    if (
      loadingInitial ||
      loadingMore ||
      appendError ||
      !meta.hasMore ||
      meta.nextPage === null
    ) {
      return;
    }
    void loadPage(meta.nextPage, "append");
  });

  useEffect(() => {
    latestRequestKeyRef.current = requestKey;
    setRows([]);
    setMeta(INITIAL_EVENT_META);
    setError(false);
    setAppendError(false);
    void loadPage(1, "replace");
  }, [requestKey]);

  useEffect(() => {
    const target = sentinelNode;
    if (
      !target ||
      loadingInitial ||
      loadingMore ||
      appendError ||
      error ||
      !meta.hasMore ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          loadNextPage();
        }
      },
      {
        root: null,
        rootMargin: "360px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(target);
    const frameId = window.requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 480 && rect.bottom >= -480) {
        loadNextPage();
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [
    appendError,
    error,
    loadingInitial,
    loadingMore,
    meta.hasMore,
    meta.nextPage,
    sentinelNode,
  ]);

  useEffect(() => {
    if (!drawerOpen || !selectedEventId) return;
    let active = true;
    setDetailLoading(true);
    fetchEventRecordDetail(siteId, selectedEventId, timeWindow)
      .then((payload) => {
        if (!active) return;
        setDetail(payload.data);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [drawerOpen, selectedEventId, siteId, timeWindow]);

  const toggleSort = (key: EventRecordSortKey) => {
    setSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === "desc" ? "asc" : "desc",
          }
        : { key, direction: "desc" },
    );
  };

  const openRecord = (eventId: string) => {
    setSelectedEventId(eventId);
    setDetail(null);
    setDrawerOpen(true);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-medium">{labels.recordsTitle}</h2>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <RiSearchLine className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.search}
            className="pl-8"
          />
        </div>
      </div>

      <EventRecordsTable
        locale={locale}
        messages={messages}
        labels={labels}
        rows={rows}
        sort={sort}
        onSort={toggleSort}
        onOpenRecord={openRecord}
        loadingRows={replacingRows}
        loadingMore={loadingMore}
        error={error}
        appendError={appendError}
        hasMore={meta.hasMore}
        sentinelRef={setSentinelNode}
      />

      <EventRecordDetailDrawer
        locale={locale}
        messages={messages}
        labels={labels}
        siteId={siteId}
        pathname={pathname}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        detail={detail}
        loading={detailLoading}
      />
    </section>
  );
}

export function EventFieldsCard({
  locale,
  labels,
  siteId,
  window: timeWindow,
  filters,
  eventName,
  loading,
  fields,
}: {
  locale: Locale;
  labels: EventPageCopy;
  siteId: string;
  window: TimeWindow;
  filters: DashboardFilters;
  eventName: string;
  loading: boolean;
  fields: EventField[];
}) {
  const reduceDataRowMotion = useReducedMotion() ?? false;
  const [payloadFilters, setPayloadFilters] = useState<
    EventPayloadFilterRule[]
  >([]);
  const [payloadFilterDialogOpen, setPayloadFilterDialogOpen] = useState(false);
  const [payloadFilterDraft, setPayloadFilterDraft] = useState("");
  const [payloadFilterError, setPayloadFilterError] = useState("");
  const payloadFiltersKey = useMemo(
    () => JSON.stringify(payloadFilters),
    [payloadFilters],
  );
  const activePayloadFilterCount = payloadFilters.length;
  const effectiveFilters = useMemo<DashboardFilters>(() => {
    if (payloadFilters.length === 0) return filters;
    return {
      ...filters,
      eventPayloadFilters: payloadFilters,
    };
  }, [filters, payloadFilters, payloadFiltersKey]);
  const effectiveFiltersKey = useMemo(
    () => JSON.stringify(effectiveFilters ?? {}),
    [effectiveFilters],
  );
  const [filteredFields, setFilteredFields] = useState<EventField[]>([]);
  const [filteredFieldsLoading, setFilteredFieldsLoading] = useState(false);
  const [filteredFieldsError, setFilteredFieldsError] = useState(false);
  const activeFields =
    activePayloadFilterCount > 0
      ? filteredFieldsLoading && filteredFields.length === 0
        ? fields
        : filteredFields
      : fields;
  const fieldListLoading =
    loading || (activePayloadFilterCount > 0 && filteredFieldsLoading);
  const fieldListError = activePayloadFilterCount > 0 && filteredFieldsError;
  const fieldTree = useMemo(
    () => buildEventFieldTree(activeFields),
    [activeFields],
  );
  const defaultExpandedFieldKeys = useMemo(
    () => collectEventFieldTreeExpansionKeys(fieldTree),
    [fieldTree],
  );
  const preferredSelectedField = useMemo(() => {
    if (activeFields.length === 0) return null;
    return (
      activeFields.find(
        (field) =>
          field.valueType !== "object" &&
          field.valueType !== "array" &&
          normalizeEventFieldPath(field.path) !== "",
      ) ??
      activeFields.find(
        (field) => normalizeEventFieldPath(field.path) !== "",
      ) ??
      activeFields[0] ??
      null
    );
  }, [activeFields]);
  const fieldRequestKey = useMemo(
    () =>
      [
        siteId,
        eventName,
        timeWindow.from,
        timeWindow.to,
        timeWindow.interval,
        timeWindow.timeZone,
        effectiveFiltersKey,
      ].join(":"),
    [
      eventName,
      effectiveFiltersKey,
      siteId,
      timeWindow.from,
      timeWindow.interval,
      timeWindow.timeZone,
      timeWindow.to,
    ],
  );
  const [selectedFieldKey, setSelectedFieldKey] = useState("");
  const [expandedFieldKeys, setExpandedFieldKeys] = useState<Set<string>>(
    () => new Set(defaultExpandedFieldKeys),
  );
  const [fieldValues, setFieldValues] = useState<EventFieldValueStat[]>([]);
  const [fieldValuesLoading, setFieldValuesLoading] = useState(false);
  const [fieldValuesError, setFieldValuesError] = useState(false);

  const selectedField = useMemo(() => {
    if (activeFields.length === 0) return null;
    if (selectedFieldKey) {
      const match = activeFields.find(
        (field) => eventFieldKey(field) === selectedFieldKey,
      );
      if (match) return match;
    }
    return preferredSelectedField;
  }, [activeFields, preferredSelectedField, selectedFieldKey]);

  const selectedFieldResolvedKey = selectedField
    ? eventFieldKey(selectedField)
    : "";

  useEffect(() => {
    setExpandedFieldKeys(new Set(defaultExpandedFieldKeys));
  }, [defaultExpandedFieldKeys, fieldRequestKey]);

  useEffect(() => {
    if (activePayloadFilterCount === 0) {
      setFilteredFields([]);
      setFilteredFieldsLoading(false);
      setFilteredFieldsError(false);
      return;
    }
    if (loading) return;

    let active = true;
    setFilteredFieldsLoading(true);
    setFilteredFieldsError(false);

    fetchEventTypeDetail(siteId, timeWindow, eventName, effectiveFilters)
      .then((payload) => {
        if (!active) return;
        setFilteredFields(payload.fields);
      })
      .catch(() => {
        if (!active) return;
        setFilteredFields([]);
        setFilteredFieldsError(true);
      })
      .finally(() => {
        if (active) setFilteredFieldsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    activePayloadFilterCount,
    effectiveFilters,
    effectiveFiltersKey,
    eventName,
    loading,
    siteId,
    timeWindow,
  ]);

  useEffect(() => {
    if (fieldListLoading) return;
    if (!selectedField) {
      setFieldValues([]);
      setFieldValuesLoading(false);
      setFieldValuesError(false);
      return;
    }

    let active = true;
    setFieldValuesLoading(true);
    setFieldValuesError(false);

    fetchEventTypeFieldValues(
      siteId,
      timeWindow,
      eventName,
      selectedField.path,
      selectedField.valueType,
      effectiveFilters,
      {
        limit: 25,
      },
    )
      .then((payload) => {
        if (!active) return;
        setFieldValues(payload.data);
      })
      .catch(() => {
        if (!active) return;
        setFieldValues([]);
        setFieldValuesError(true);
      })
      .finally(() => {
        if (active) setFieldValuesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    effectiveFilters,
    effectiveFiltersKey,
    eventName,
    fieldListLoading,
    selectedField?.path,
    selectedField?.valueType,
    siteId,
    timeWindow.from,
    timeWindow.interval,
    timeWindow.timeZone,
    timeWindow.to,
  ]);

  const fieldValueTotal = useMemo(
    () =>
      fieldValues.reduce(
        (sum, item) => sum + Math.max(0, Number(item.occurrences ?? 0)),
        0,
      ),
    [fieldValues],
  );

  const openPayloadFilterDialog = () => {
    setPayloadFilterDraft(formatPayloadFilterRules(payloadFilters));
    setPayloadFilterError("");
    setPayloadFilterDialogOpen(true);
  };

  const applyPayloadFilterDraft = () => {
    const parsed = parsePayloadFilterInput(payloadFilterDraft);
    if (!parsed.ok) {
      setPayloadFilterError(labels.payloadFilterInvalid);
      return;
    }
    setPayloadFilters(parsed.rules);
    setPayloadFilterError("");
    setPayloadFilterDialogOpen(false);
  };

  const clearPayloadFilters = () => {
    setPayloadFilterDraft("");
    setPayloadFilters([]);
    setPayloadFilterError("");
  };

  const applyFieldValueFilter = (
    field: EventField,
    value: EventPayloadFilterValue,
  ) => {
    const path = normalizeEventFieldPath(field.path);
    if (!path) return;
    setPayloadFilters((current) => {
      const hasSameValueFilter = current.some(
        (rule) =>
          rule.operator === "eq" &&
          normalizeEventFieldPath(rule.path) === path &&
          payloadFilterValueType(rule.value) ===
            payloadFilterValueType(value) &&
          payloadFilterValuesEqual(rule.value, value),
      );
      const withoutCurrentPath = current.filter(
        (rule) => normalizeEventFieldPath(rule.path) !== path,
      );
      if (hasSameValueFilter) return withoutCurrentPath;
      return [
        ...withoutCurrentPath,
        {
          path,
          operator: "eq",
          value,
        },
      ];
    });
  };

  const toggleFieldExpansion = (fieldKey: string) => {
    setExpandedFieldKeys((current) => {
      const next = new Set(current);
      if (next.has(fieldKey)) {
        next.delete(fieldKey);
      } else {
        next.add(fieldKey);
      }
      return next;
    });
  };

  const renderFieldTreeNode = (
    node: EventFieldTreeNode,
    depth: number,
  ): ReactNode => {
    const nodeKey = node.path || "/";
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedFieldKeys.has(nodeKey);
    const isRoot = node.path === "";
    const isArrayItem = node.segment === "*";
    const selectableField =
      node.fields.find(
        (field) =>
          eventFieldKey(field) === selectedFieldResolvedKey &&
          field.valueType !== "object" &&
          field.valueType !== "array",
      ) ??
      node.fields.find(
        (field) => field.valueType !== "object" && field.valueType !== "array",
      ) ??
      null;
    const selectableFieldKey = selectableField
      ? eventFieldKey(selectableField)
      : "";
    const isSelected =
      Boolean(selectableFieldKey) &&
      selectableFieldKey === selectedFieldResolvedKey;
    const indentStyle = { paddingLeft: `${depth * 1.25}rem` };
    const fieldLabel = isRoot
      ? labels.payload
      : isArrayItem
        ? "*"
        : formatEventFieldKeySegment(node.segment);
    const childRows = isExpanded
      ? node.children.map((child) => renderFieldTreeNode(child, depth + 1))
      : null;
    const selectField = () => {
      if (!selectableField || fieldListLoading) return;
      setSelectedFieldKey(selectableFieldKey);
    };
    const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (!selectableField || fieldListLoading) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectField();
    };

    const openLine = (
      <div
        key={`${nodeKey}:open`}
        role={selectableField ? "button" : undefined}
        tabIndex={selectableField && !fieldListLoading ? 0 : undefined}
        onClick={selectableField ? selectField : undefined}
        onKeyDown={selectableField ? handleRowKeyDown : undefined}
        className={cn(
          "group flex items-center gap-2 rounded px-1 py-1 transition-[background-color,box-shadow,filter] duration-200",
          selectableField &&
            "cursor-pointer hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
          isSelected && "bg-accent/25 ring-1 ring-border/70",
          fieldListLoading && "opacity-80",
        )}
        style={indentStyle}
      >
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 rounded-none text-primary shadow-none transition-colors hover:bg-primary/10 hover:text-primary"
            onClick={(event) => {
              event.stopPropagation();
              toggleFieldExpansion(nodeKey);
            }}
            disabled={fieldListLoading}
            aria-label={isExpanded ? labels.collapseField : labels.expandField}
            title={isExpanded ? labels.collapseField : labels.expandField}
          >
            <RiArrowDownSLine
              className={cn(
                "size-3.5 transition-transform duration-200 ease-out",
                isExpanded ? "rotate-0" : "-rotate-90",
              )}
            />
          </Button>
        ) : (
          <span className="size-6 shrink-0" />
        )}

        <div className="min-w-0 flex-1 truncate">
          <span
            className={cn(
              "text-foreground",
              isArrayItem && "text-muted-foreground",
            )}
          >
            {fieldLabel}
          </span>
        </div>

        {selectableField ? (
          <button
            type="button"
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
            )}
            onClick={(event) => {
              event.stopPropagation();
              selectField();
            }}
            disabled={fieldListLoading}
            aria-label={`${labels.fieldValuesTitle}: ${fieldLabel}`}
            title={labels.fieldValuesTitle}
          >
            <RiSearchLine className="size-3.5" />
          </button>
        ) : null}
      </div>
    );

    if (!hasChildren) return openLine;

    return (
      <div key={nodeKey} className="space-y-0.5">
        {openLine}
        <AutoResizer duration={0.22} ease={[0.22, 1, 0.36, 1]}>
          <AutoTransition
            initial={false}
            duration={0.18}
            customVariants={FIELD_TREE_CHILD_TRANSITION}
            presenceMode="sync"
            transitionKey={
              isExpanded ? `${nodeKey}:expanded` : `${nodeKey}:collapsed`
            }
          >
            {childRows ? <div className="space-y-0.5">{childRows}</div> : null}
          </AutoTransition>
        </AutoResizer>
      </div>
    );
  };

  const fieldValueTableHeader = (
    <TableRow className="hover:bg-transparent">
      <TableHead className="h-8 p-0">
        <div className="px-4">{labels.values}</div>
      </TableHead>
      <TableHead className="h-8 w-24 p-0">
        <div className="px-4 text-right">{labels.occurrences}</div>
      </TableHead>
    </TableRow>
  );

  const fieldValueRows = (
    <AnimatePresence initial={false} mode="popLayout">
      {fieldValues.map((item) => {
        const count = Math.max(0, Number(item.occurrences ?? 0));
        const progressPercent =
          fieldValueTotal > 0 ? (count / fieldValueTotal) * 100 : 0;
        const valueLabel = formatFieldValueLabel(item.value);
        const activeValueFilter =
          selectedField !== null &&
          isPayloadFilterActive(payloadFilters, selectedField.path, item.value);
        const selectValueFilter = () => {
          if (!selectedField || fieldListLoading) return;
          applyFieldValueFilter(selectedField, item.value);
        };
        const handleValueRowKeyDown = (
          event: KeyboardEvent<HTMLTableRowElement>,
        ) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          selectValueFilter();
        };

        return (
          <AnimatedDataTableRow
            key={eventFieldValueKey(item.value)}
            reduceMotion={reduceDataRowMotion}
            role="button"
            tabIndex={fieldListLoading ? undefined : 0}
            data-state={activeValueFilter ? "selected" : undefined}
            onClick={selectValueFilter}
            onKeyDown={handleValueRowKeyDown}
            className={cn(
              "cursor-pointer bg-no-repeat transition-[background-size,background-color,filter] duration-300 ease-out hover:bg-muted/30 hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
              activeValueFilter &&
                "bg-primary/10 hover:bg-primary/15 data-[state=selected]:bg-primary/10",
            )}
            style={{
              backgroundImage:
                "linear-gradient(90deg, var(--muted) 0%, var(--muted) 100%)",
              backgroundSize: `${progressPercent.toFixed(2)}% 100%`,
              backgroundPosition: "left top",
            }}
          >
            <TableCell className="whitespace-normal p-0 align-top">
              <div
                className="px-4 py-2 font-mono leading-5 break-words whitespace-normal"
                title={valueLabel}
              >
                {valueLabel}
              </div>
            </TableCell>
            <TableCell className="p-0">
              <div className="px-4 py-2 text-right font-mono tabular-nums">
                {numberFormat(locale, count)}
              </div>
            </TableCell>
          </AnimatedDataTableRow>
        );
      })}
    </AnimatePresence>
  );

  return (
    <>
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium">{labels.fieldsTitle}</h2>
          </div>
          <PayloadFilterButton
            labels={labels}
            count={activePayloadFilterCount}
            onClick={openPayloadFilterDialog}
          />
        </div>

        <div className="grid items-stretch gap-6 xl:grid-cols-2">
          <Card className="h-full overflow-hidden py-0">
            <CardHeader className="space-y-2 pt-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CardTitle>{labels.payloadFields}</CardTitle>
                  {fieldListLoading ? <Spinner className="size-3.5" /> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {labels.fieldsSubtitle}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pb-5">
              <div className="max-h-[38rem] overflow-auto pr-1 font-mono text-[13px] leading-6">
                {fieldListError ? (
                  <div className="rounded-none border border-border/50 bg-muted/20 px-4 py-6 font-sans text-sm text-muted-foreground">
                    {labels.loadError}
                  </div>
                ) : activeFields.length === 0 ? (
                  <div className="rounded-none border border-border/50 bg-muted/20 px-4 py-6 font-sans text-sm text-muted-foreground">
                    {labels.emptyFields}
                  </div>
                ) : fieldTree.children.length > 0 ? (
                  <div className="min-w-max">
                    {fieldTree.children.map((child) =>
                      renderFieldTreeNode(child, 0),
                    )}
                  </div>
                ) : (
                  <div className="min-w-max">
                    {renderFieldTreeNode(fieldTree, 0)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="h-full overflow-hidden py-0">
            <CardHeader className="space-y-2 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle>{labels.fieldValuesTitle}</CardTitle>
                    {fieldValuesLoading ? (
                      <Spinner className="size-3.5" />
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {labels.fieldValuesSubtitle}
                  </p>
                </div>
                {selectedField ? (
                  <AutoTransition
                    initial={false}
                    transitionKey={selectedFieldResolvedKey}
                    className="min-w-0 shrink-0"
                  >
                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 pt-1">
                      <Badge variant="ghost" className="shrink-0">
                        {selectedField.valueType}
                      </Badge>
                      <span className="max-w-[18rem] truncate font-mono text-xs text-muted-foreground">
                        {selectedField.path || "/"}
                      </span>
                    </div>
                  </AutoTransition>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <DataTableSwitch
                loading={
                  Boolean(selectedField) &&
                  (fieldListLoading || fieldValuesLoading)
                }
                hasContent={
                  Boolean(selectedField) &&
                  !fieldValuesError &&
                  fieldValues.length > 0
                }
                loadingLabel={labels.loading}
                emptyLabel={
                  fieldValuesError ? labels.loadError : labels.fieldValuesEmpty
                }
                colSpan={2}
                header={fieldValueTableHeader}
                rows={fieldValueRows}
                contentKey={`${selectedFieldResolvedKey}-${fieldValues.length}-${fieldValueTotal}`}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <Dialog
        open={payloadFilterDialogOpen}
        onOpenChange={setPayloadFilterDialogOpen}
      >
        <DialogContent className="z-[1000] max-w-xl" overlayClassName="z-[999]">
          <DialogHeader>
            <DialogTitle>{labels.payloadFilterTitle}</DialogTitle>
            <DialogDescription>
              {labels.payloadFilterSubtitle}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <textarea
              value={payloadFilterDraft}
              onChange={(event) => {
                setPayloadFilterDraft(event.target.value);
                if (payloadFilterError) setPayloadFilterError("");
              }}
              placeholder={labels.payloadFilterPlaceholder}
              className="min-h-32 w-full resize-y rounded-none border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            />
            {payloadFilterError ? (
              <p className="text-xs text-destructive">{payloadFilterError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={clearPayloadFilters}
            >
              {labels.payloadFilterClear}
            </Button>
            <Button type="button" onClick={applyPayloadFilterDraft}>
              {labels.payloadFilterApply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EventPageHeader({
  messages,
  title,
  subtitle,
  backHref,
  backLabel,
  onBack,
}: {
  messages: AppMessages;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const handleBack = onBack
    ? onBack
    : backHref
      ? () => navigateWithTransition(router, backHref)
      : null;

  return (
    <PageHeading
      title={title}
      subtitle={subtitle}
      actions={
        handleBack ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBack}
          >
            <RiArrowLeftLine data-icon="inline-start" />
            {backLabel || messages.common.backToTeam}
          </Button>
        ) : null
      }
    />
  );
}
