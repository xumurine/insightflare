"use client";

import { type ComponentType, useEffect, useMemo, useState } from "react";
import {
  RiAlarmWarningLine,
  RiDatabase2Line,
  RiRefreshLine,
  RiSpeedUpLine,
  RiTimeLine,
} from "@remixicon/react";
import { toast } from "sonner";

import { useDashboardQueryControls } from "@/components/dashboard/dashboard-query-provider";
import { DataTableSwitch } from "@/components/dashboard/data-table-switch";
import { PageHeading } from "@/components/dashboard/page-heading";
import { AutoTransition } from "@/components/ui/auto-transition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import {
  intlLocale,
  numberFormat,
  shortDateTime,
} from "@/lib/dashboard/format";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import type {
  SystemPerformanceData,
  SystemPerformanceWindowMinutes,
} from "@/lib/system-performance";
import { cn } from "@/lib/utils";

interface SystemPerformanceClientProps {
  locale: Locale;
  messages: AppMessages;
}

interface ApiErrorResponse {
  ok?: false;
  error?: string;
  message?: string;
}

const WINDOW_OPTIONS: readonly SystemPerformanceWindowMinutes[] = [
  15, 60, 360, 1440,
] as const;

async function fetchSystemPerformance(
  minutes: SystemPerformanceWindowMinutes,
): Promise<SystemPerformanceData> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
    const { handleDemoRequest } = await import("@/lib/realtime/mock");
    return handleDemoRequest({
      path: "/api/private/admin/system-performance",
      params: { minutes },
    }) as SystemPerformanceData;
  }

  const response = await fetch(
    `/api/private/admin/system-performance?minutes=${minutes}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    },
  );
  const payload = (await response.json()) as
    | SystemPerformanceData
    | ApiErrorResponse;
  if (!response.ok || payload.ok !== true) {
    throw new Error(
      ("message" in payload && payload.message) ||
        ("error" in payload && payload.error) ||
        "load_system_performance_failed",
    );
  }
  return payload;
}

function formatMetricNumber(locale: Locale, value: number): string {
  return numberFormat(locale, Math.round(value));
}

function formatMetricRate(locale: Locale, value: number): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(locale: Locale, value: number): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatLatency(locale: Locale, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  const normalized = Math.max(0, value);
  if (normalized < 1000) {
    return `${formatMetricNumber(locale, normalized)} ms`;
  }
  return `${new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 2,
  }).format(normalized / 1000)} s`;
}

function formatAge(locale: Locale, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${formatMetricNumber(locale, seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${formatMetricNumber(locale, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (remainMinutes === 0) return `${formatMetricNumber(locale, hours)} h`;
  return `${formatMetricNumber(locale, hours)} h ${formatMetricNumber(locale, remainMinutes)} min`;
}

function formatEventKind(messages: AppMessages, kind: string): string {
  if (kind === "custom_event") return messages.realtime.customEvent;
  return messages.realtime.viewPage;
}

function windowLabel(
  messages: AppMessages,
  minutes: SystemPerformanceWindowMinutes,
): string {
  if (minutes === 15) return messages.systemPerformance.range15m;
  if (minutes === 60) return messages.systemPerformance.range1h;
  if (minutes === 360) return messages.systemPerformance.range6h;
  return messages.systemPerformance.range24h;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "good";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              {title}
            </div>
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
            <div className="text-xs text-muted-foreground">{description}</div>
          </div>
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center border border-border",
              tone === "warning" &&
                "border-destructive/30 bg-destructive/10 text-destructive",
              tone === "good" && "border-primary/30 bg-primary/10 text-primary",
            )}
          >
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SystemPerformanceClient({
  locale,
  messages,
}: SystemPerformanceClientProps) {
  const { timeZone } = useDashboardQueryControls();
  const t = messages.systemPerformance;
  const [minutes, setMinutes] = useState<SystemPerformanceWindowMinutes>(60);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [data, setData] = useState<SystemPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSystemPerformance(minutes)
      .then((next) => {
        if (!active) return;
        setData(next);
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : t.loadFailed;
        toast.error(message || t.loadFailed);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [minutes, refreshNonce, t.loadFailed]);

  const bucketFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      }),
    [locale, timeZone],
  );
  const maxTrendEvents = Math.max(
    1,
    ...(data?.trend.map((point) => point.totalEvents) ?? []),
  );
  const summary = data?.summary;
  const openVisits = data?.openVisits;
  const anomalyTone =
    summary && summary.anomalyRate > 0.02 ? "warning" : "default";
  const freshnessTone =
    summary?.dataFreshnessMs !== null &&
    summary?.dataFreshnessMs !== undefined &&
    summary.dataFreshnessMs < 2 * 60 * 1000
      ? "good"
      : "warning";

  return (
    <div className="space-y-5">
      <PageHeading
        title={t.title}
        subtitle={t.subtitle}
        actions={
          <>
            <Select
              value={String(minutes)}
              onValueChange={(value) => {
                const next = Number(value);
                if (
                  WINDOW_OPTIONS.includes(
                    next as SystemPerformanceWindowMinutes,
                  )
                ) {
                  setMinutes(next as SystemPerformanceWindowMinutes);
                }
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {windowLabel(messages, option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={loading}
              onClick={() => setRefreshNonce((value) => value + 1)}
            >
              <AutoTransition className="inline-flex items-center gap-2">
                {loading ? (
                  <span
                    key="loading"
                    className="inline-flex items-center gap-2"
                  >
                    <Spinner className="size-4" />
                    {messages.common.loading}
                  </span>
                ) : (
                  <span
                    key="refresh"
                    className="inline-flex items-center gap-2"
                  >
                    <RiRefreshLine className="size-4" />
                    {t.refresh}
                  </span>
                )}
              </AutoTransition>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t.totalEvents}
          value={
            summary ? formatMetricNumber(locale, summary.totalEvents) : "--"
          }
          description={
            summary
              ? `${formatMetricRate(locale, summary.eventsPerMinute)} / min`
              : "--"
          }
          icon={RiDatabase2Line}
        />
        <StatCard
          title={t.p95Latency}
          value={summary ? formatLatency(locale, summary.p95LatencyMs) : "--"}
          description={
            summary
              ? `${t.p50Latency}: ${formatLatency(locale, summary.p50LatencyMs)}`
              : "--"
          }
          icon={RiSpeedUpLine}
          tone={
            summary?.p95LatencyMs !== null &&
            summary?.p95LatencyMs !== undefined &&
            summary.p95LatencyMs > (data?.thresholds.delayedMs ?? 0)
              ? "warning"
              : "default"
          }
        />
        <StatCard
          title={t.dataFreshness}
          value={summary ? formatAge(locale, summary.dataFreshnessMs) : "--"}
          description={
            summary?.latestCreatedAt
              ? shortDateTime(locale, summary.latestCreatedAt, timeZone)
              : t.noRecentWrite
          }
          icon={RiTimeLine}
          tone={freshnessTone}
        />
        <StatCard
          title={t.clockAnomalies}
          value={summary ? formatPercent(locale, summary.anomalyRate) : "--"}
          description={
            summary
              ? `${t.delayed}: ${formatMetricNumber(locale, summary.delayedEvents)} / ${t.future}: ${formatMetricNumber(locale, summary.futureSkewedEvents)}`
              : "--"
          }
          icon={RiAlarmWarningLine}
          tone={anomalyTone}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t.throughputTrend}</CardTitle>
            <CardDescription>{t.throughputTrendDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data?.trend ?? []).length > 0 ? (
                data?.trend.map((point) => {
                  const visitWidth = `${(point.visits / maxTrendEvents) * 100}%`;
                  const customWidth = `${(point.customEvents / maxTrendEvents) * 100}%`;
                  const hasAnomaly =
                    point.delayedEvents > 0 || point.futureSkewedEvents > 0;
                  return (
                    <div
                      key={point.bucket}
                      className="grid grid-cols-[74px_minmax(0,1fr)_72px] items-center gap-3 text-xs"
                    >
                      <div className="text-muted-foreground tabular-nums">
                        {bucketFormatter.format(new Date(point.timestampMs))}
                      </div>
                      <div className="flex h-7 min-w-0 items-center overflow-hidden border border-border bg-muted/25">
                        <div
                          className="h-full bg-primary/70"
                          style={{ width: visitWidth }}
                        />
                        <div
                          className="h-full bg-foreground/35"
                          style={{ width: customWidth }}
                        />
                        {hasAnomaly ? (
                          <div className="ml-1 h-3 w-1 bg-destructive" />
                        ) : null}
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        {formatMetricNumber(locale, point.totalEvents)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  {loading ? messages.common.loading : t.noData}
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="gap-1">
                <span className="size-2 bg-primary/70" />
                {t.visits}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <span className="size-2 bg-foreground/35" />
                {t.customEvents}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <span className="h-3 w-1 bg-destructive" />
                {t.anomalyBucket}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.openVisitHealth}</CardTitle>
            <CardDescription>{t.openVisitHealthDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="border border-border p-3">
                <div className="text-xs text-muted-foreground">{t.open}</div>
                <div className="text-xl font-semibold tabular-nums">
                  {openVisits
                    ? formatMetricNumber(locale, openVisits.total)
                    : "--"}
                </div>
              </div>
              <div className="border border-border p-3">
                <div className="text-xs text-muted-foreground">{t.stale}</div>
                <div className="text-xl font-semibold tabular-nums">
                  {openVisits
                    ? formatMetricNumber(locale, openVisits.stale)
                    : "--"}
                </div>
              </div>
              <div className="border border-border p-3">
                <div className="text-xs text-muted-foreground">
                  {t.timedOut}
                </div>
                <div className="text-xl font-semibold tabular-nums">
                  {openVisits
                    ? formatMetricNumber(locale, openVisits.timedOut)
                    : "--"}
                </div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t.oldestOpen}</span>
                <span className="font-mono text-xs">
                  {openVisits?.oldestStartedAt
                    ? shortDateTime(
                        locale,
                        openVisits.oldestStartedAt,
                        timeZone,
                      )
                    : "--"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {t.latestActivity}
                </span>
                <span className="font-mono text-xs">
                  {openVisits?.newestActivityAt
                    ? shortDateTime(
                        locale,
                        openVisits.newestActivityAt,
                        timeZone,
                      )
                    : "--"}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t.estimationNote}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.topSitesTitle}</CardTitle>
          <CardDescription>{t.topSitesDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTableSwitch
            loading={loading}
            hasContent={(data?.topSites.length ?? 0) > 0}
            loadingLabel={messages.common.loading}
            emptyLabel={t.noData}
            colSpan={7}
            header={
              <TableRow>
                <TableHead>{messages.common.site}</TableHead>
                <TableHead className="text-right">{t.events}</TableHead>
                <TableHead className="text-right">{t.visits}</TableHead>
                <TableHead className="text-right">{t.customEvents}</TableHead>
                <TableHead className="text-right">{t.avgLatency}</TableHead>
                <TableHead className="text-right">{t.delayed}</TableHead>
                <TableHead className="text-right">{t.future}</TableHead>
              </TableRow>
            }
            rows={(data?.topSites ?? []).map((site) => (
              <TableRow key={site.siteId}>
                <TableCell>
                  <div className="min-w-0">
                    <div className="font-medium">{site.siteName}</div>
                    <div className="text-xs text-muted-foreground">
                      {site.siteDomain || site.siteId}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMetricNumber(locale, site.totalEvents)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMetricNumber(locale, site.visits)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMetricNumber(locale, site.customEvents)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatLatency(locale, site.avgLatencyMs)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMetricNumber(locale, site.delayedEvents)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMetricNumber(locale, site.futureSkewedEvents)}
                </TableCell>
              </TableRow>
            ))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.slowestEventsTitle}</CardTitle>
          <CardDescription>{t.slowestEventsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTableSwitch
            loading={loading}
            hasContent={(data?.slowEvents.length ?? 0) > 0}
            loadingLabel={messages.common.loading}
            emptyLabel={t.noData}
            colSpan={5}
            header={
              <TableRow>
                <TableHead>{messages.common.event}</TableHead>
                <TableHead>{messages.common.site}</TableHead>
                <TableHead>{t.eventTime}</TableHead>
                <TableHead>{t.serverTime}</TableHead>
                <TableHead className="text-right">{t.estimatedDelay}</TableHead>
              </TableRow>
            }
            rows={(data?.slowEvents ?? []).map((event, index) => (
              <TableRow
                key={`${event.kind}-${event.siteId}-${event.eventAt}-${index}`}
              >
                <TableCell>{formatEventKind(messages, event.kind)}</TableCell>
                <TableCell>
                  <div className="min-w-0">
                    <div className="font-medium">{event.siteName}</div>
                    <div className="text-xs text-muted-foreground">
                      {event.siteDomain || event.siteId}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono">
                  {shortDateTime(locale, event.eventAt, timeZone)}
                </TableCell>
                <TableCell className="font-mono">
                  {shortDateTime(locale, event.serverAt, timeZone)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatLatency(locale, event.latencyMs)}
                </TableCell>
              </TableRow>
            ))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
