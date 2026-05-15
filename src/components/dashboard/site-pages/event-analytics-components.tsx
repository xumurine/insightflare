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
import { useRouter } from "next/navigation";
import type { RemixiconComponentType } from "@remixicon/react";
import {
  RiArrowDownSLine,
  RiArrowLeftLine,
  RiArrowUpSLine,
  RiDatabase2Line,
  RiExternalLinkLine,
  RiFileList3Line,
  RiPulseLine,
  RiSearchLine,
  RiStackLine,
} from "@remixicon/react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
import {
  fetchEventRecordDetail,
  fetchEventsRecords,
} from "@/lib/dashboard/client-data";
import {
  intlLocale,
  numberFormat,
  percentFormat,
} from "@/lib/dashboard/format";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type {
  EventField,
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
const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "#0f766e",
  "#b45309",
  "#be123c",
  "var(--muted-foreground)",
] as const;

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
  const series = useMemo(
    () =>
      trend.series.map((item, index) => ({
        ...item,
        displayLabel: eventSeriesLabel(item, labels),
        color: item.isOther
          ? "var(--muted-foreground)"
          : CHART_COLORS[index % CHART_COLORS.length],
      })),
    [labels, trend.series],
  );
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
                        locale={locale}
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
    return <span className="text-foreground">{JSON.stringify(value)}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-foreground">{String(value)}</span>;
  }
  return null;
}

function JsonTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || typeof value !== "object") {
    return <ScalarValue value={value} />;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>;
    return (
      <div className="space-y-1">
        {value.map((item, index) => (
          <div
            key={index}
            className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2"
          >
            <span className="text-right text-muted-foreground">[{index}]</span>
            <div className={cn(depth > 0 && "border-l pl-3")}>
              <JsonTree value={item} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <span>{"{}"}</span>;
  return (
    <div className="space-y-1">
      {entries.map(([key, child]) => (
        <div key={key} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
          <span className="truncate text-muted-foreground" title={key}>
            {key}
          </span>
          <div className={cn(depth > 0 && "border-l pl-3")}>
            <JsonTree value={child} depth={depth + 1} />
          </div>
        </div>
      ))}
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

export function EventRecordDetailDrawer({
  locale,
  messages,
  labels,
  pathname,
  open,
  onOpenChange,
  detail,
  loading,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: EventPageCopy;
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: EventRecordDetailData["data"] | null;
  loading: boolean;
}) {
  const router = useRouter();
  const basePath = pathname.replace(/\/events(?:\/detail)?$/, "");
  const visitorHref = detail?.context.visitorId
    ? `${basePath}/visitors/detail?visitorId=${encodeURIComponent(detail.context.visitorId)}`
    : "";
  const sessionHref = detail?.context.sessionId
    ? `${basePath}/sessions/detail?sessionId=${encodeURIComponent(detail.context.sessionId)}`
    : "";

  const openLink = (href: string) => {
    if (!href) return;
    onOpenChange(false);
    navigateWithTransition(router, href);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="w-full sm:max-w-2xl">
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
                        locale={locale}
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
                    disabled={!visitorHref}
                    onClick={() => openLink(visitorHref)}
                  >
                    <RiExternalLinkLine data-icon="inline-start" />
                    {labels.openVisitor}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!sessionHref}
                    onClick={() => openLink(sessionHref)}
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
                  <JsonTree value={detail.eventData} />
                </div>
              </section>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
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
  fields,
}: {
  locale: Locale;
  labels: EventPageCopy;
  fields: EventField[];
}) {
  return (
    <Card className="py-0">
      <CardHeader>
        <CardTitle>{labels.fieldsTitle}</CardTitle>
        <p className="text-xs text-muted-foreground">{labels.fieldsSubtitle}</p>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">{labels.jsonPath}</TableHead>
              <TableHead>{labels.type}</TableHead>
              <TableHead className="text-right">{labels.totalEvents}</TableHead>
              <TableHead className="text-right">{labels.occurrences}</TableHead>
              <TableHead>{labels.firstSeen}</TableHead>
              <TableHead>{labels.lastSeen}</TableHead>
              <TableHead className="pr-4">{labels.sample}</TableHead>
            </TableRow>
          </TableHeader>
          <tbody className="[&_tr:last-child]:border-0">
            {fields.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-28 text-center text-muted-foreground"
                >
                  {labels.emptyFields}
                </TableCell>
              </TableRow>
            ) : (
              fields.map((field) => (
                <TableRow key={`${field.path}:${field.valueType}`}>
                  <TableCell className="max-w-72 pl-4 font-mono">
                    <span className="truncate" title={field.path || "/"}>
                      {field.path || "/"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{field.valueType}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {numberFormat(locale, field.events)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {numberFormat(locale, field.occurrences)}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {formatShortDateTime(locale, field.firstSeenAt)}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {formatShortDateTime(locale, field.lastSeenAt)}
                  </TableCell>
                  <TableCell className="max-w-52 pr-4 font-mono text-muted-foreground">
                    <span
                      className="truncate"
                      title={String(field.exampleValue ?? "")}
                    >
                      {field.exampleValue === null ||
                      field.exampleValue === undefined
                        ? "-"
                        : String(field.exampleValue)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function EventPageHeader({
  messages,
  title,
  subtitle,
  backHref,
  backLabel,
}: {
  messages: AppMessages;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  return (
    <PageHeading
      title={title}
      subtitle={subtitle}
      actions={
        backHref ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigateWithTransition(router, backHref)}
          >
            <RiArrowLeftLine data-icon="inline-start" />
            {backLabel || messages.common.backToTeam}
          </Button>
        ) : null
      }
    />
  );
}
