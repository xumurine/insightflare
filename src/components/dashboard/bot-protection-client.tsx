"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  RiGlobalLine,
  RiRadarLine,
  RiRefreshLine,
  RiRobot2Line,
  RiShieldCheckLine,
} from "@remixicon/react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { GeoPointsMapIsland } from "@/components/dashboard/geo-points-map-island";
import { AutoResizer } from "@/components/ui/auto-resizer";
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
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  intlLocale,
  numberFormat,
  percentFormat,
  shortDateTimeWithSeconds,
} from "@/lib/dashboard/format";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

interface BotProtectionClientProps {
  locale: Locale;
  messages: AppMessages;
}

interface BotEvent {
  timestamp: string;
  receivedAt: number;
  siteId: string;
  siteName: string;
  siteDomain: string;
  kind: string;
  confidence: string;
  reasons: string[];
  ip: string;
  userAgent: string;
  origin: string;
  hostname: string;
  pathname: string;
  country: string;
  region: string;
  city: string;
  continent: string;
  colo: string;
  asn: number;
  asOrganization: string;
  verifiedBotCategory: string;
  rayId: string;
  traceId: string;
  latitude: number | null;
  longitude: number | null;
  botScore: number | null;
  userAgentLength: number;
}

interface BotProtectionData {
  ok: true;
  configured: boolean;
  generatedAt: number;
  window?: {
    minutes: number;
    from: number;
    to: number;
  };
  error?: string;
  summary: {
    total: number;
    baselineRequests: number;
    botRequestRatio: number;
    highConfidence: number;
    mediumConfidence: number;
    affectedSites: number;
    uniqueAsns: number;
    uniqueCountries: number;
  };
  mapPoints: Array<{
    latitude: number;
    longitude: number;
    country: string;
    pointCount: number;
  }>;
  trend: Array<{
    timestampMs: number;
    count: number;
    baselineCount: number;
    botRatio: number;
  }>;
  reasons: Array<{ reason: string; count: number }>;
  asns: Array<{ asn: number; asOrganization: string; count: number }>;
  events: BotEvent[];
}

type WindowMinutes = 60 | 1440 | 10080 | 43200;

const WINDOW_OPTIONS: readonly WindowMinutes[] = [60, 1440, 10080, 43200];

function trendChartConfig(copy: AppMessages["botProtection"]) {
  return {
    count: {
      label: copy.botRequests,
      color: "var(--color-chart-4)",
    },
    botRatio: {
      label: copy.botTrafficRatio,
      color: "var(--color-chart-1)",
    },
  } satisfies ChartConfig;
}

const REASON_CHART_CONFIG = {
  count: {
    label: "Requests",
    color: "var(--color-chart-2)",
  },
} satisfies ChartConfig;

async function fetchBotProtection(
  minutes: WindowMinutes,
): Promise<BotProtectionData> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
    const { generateDemoBotProtectionData } =
      await import("@/lib/realtime/mock/bot-protection");
    return generateDemoBotProtectionData(minutes);
  }

  const response = await fetch(
    `/api/private/admin/bot-analytics?minutes=${minutes}&limit=200`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    },
  );
  const payload = (await response.json()) as
    | BotProtectionData
    | {
        ok?: false;
        error?: string;
        message?: string;
      };
  if (!response.ok || payload.ok !== true) {
    throw new Error(
      ("message" in payload && payload.message) ||
        ("error" in payload && payload.error) ||
        "load_bot_protection_failed",
    );
  }
  return payload;
}

function windowLabel(messages: AppMessages, minutes: WindowMinutes): string {
  if (minutes === 60) return messages.botProtection.range1h;
  if (minutes === 10080) return messages.botProtection.range7d;
  if (minutes === 43200) return messages.botProtection.range30d;
  return messages.botProtection.range24h;
}

function trendTickDateFormat(
  locale: Locale,
  minutes: WindowMinutes,
): Intl.DateTimeFormat {
  if (minutes <= 10080) {
    return new Intl.DateTimeFormat(intlLocale(locale), {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "numeric",
    day: "numeric",
  });
}

function trendTooltipDateFormat(
  locale: Locale,
  minutes: WindowMinutes,
): Intl.DateTimeFormat {
  if (minutes <= 10080) {
    return new Intl.DateTimeFormat(intlLocale(locale), {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function compactReason(reason: string): string {
  return reason.replace(/_/g, " ");
}

function formatLocation(event: BotEvent): string {
  return [event.city, event.region, event.country].filter(Boolean).join(", ");
}

function formatAsn(event: BotEvent): string {
  if (!event.asn && !event.asOrganization) return "--";
  if (!event.asn) return event.asOrganization;
  if (!event.asOrganization) return `AS${event.asn}`;
  return `AS${event.asn} ${event.asOrganization}`;
}

function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
  loading,
}: {
  icon: typeof RiRobot2Line;
  label: string;
  value: string;
  detail: string;
  loading: boolean;
}) {
  const contentKey = loading ? "loading" : value;

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
      <AutoResizer initial className="mt-3">
        <AutoTransition
          transitionKey={contentKey}
          initial={false}
          duration={0.2}
          type="fade"
          presenceMode="wait"
        >
          {loading ? (
            <div key="loading" className="flex h-7 items-center">
              <Spinner className="size-5" />
            </div>
          ) : (
            <p
              key={value}
              className="min-w-0 truncate font-mono text-xl leading-7 font-semibold text-foreground tabular-nums"
            >
              {value}
            </p>
          )}
        </AutoTransition>
      </AutoResizer>
      <p className="mt-3 min-w-0 truncate text-[11px] leading-[14px] text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function TrendTooltipValue({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-36 items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
          style={{ backgroundColor: color }}
        />
        <span className="text-muted-foreground">{label}</span>
      </span>
      <span className="font-mono text-foreground tabular-nums">{value}</span>
    </div>
  );
}

function createTrendTooltipFormatter(input: {
  botRequestsLabel: string;
  botTrafficRatioLabel: string;
  countFormatter: Intl.NumberFormat;
  locale: Locale;
}) {
  return function formatTrendTooltipValue(
    value: unknown,
    name: unknown,
    _item: unknown,
    _index: number,
    payload: unknown,
  ) {
    const row = (payload ?? null) as {
      count?: number;
      botRatio?: number;
    } | null;
    const isRatio = name === "botRatio";
    const numeric = Number(value);
    const displayValue = isRatio
      ? Number(row?.botRatio ?? numeric ?? 0)
      : Number(row?.count ?? numeric ?? 0);
    const formatted = isRatio
      ? percentFormat(
          input.locale,
          Number.isFinite(displayValue) ? displayValue : 0,
        )
      : input.countFormatter.format(
          Math.max(
            0,
            Math.round(Number.isFinite(displayValue) ? displayValue : 0),
          ),
        );
    const label = isRatio ? input.botTrafficRatioLabel : input.botRequestsLabel;
    const indicatorColor = isRatio
      ? "var(--color-botRatio)"
      : "var(--color-count)";

    return (
      <TrendTooltipValue
        color={indicatorColor}
        label={label}
        value={formatted}
      />
    );
  };
}

export function BotProtectionClient({
  locale,
  messages,
}: BotProtectionClientProps) {
  const copy = messages.botProtection;
  const [minutes, setMinutes] = useState<WindowMinutes>(43200);
  const [data, setData] = useState<BotProtectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useMemo(
    () => async (nextMinutes: WindowMinutes, mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        const next = await fetchBotProtection(nextMinutes);
        setData(next);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : copy.loadFailed);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [copy.loadFailed],
  );

  useEffect(() => {
    void load(minutes, "initial");
  }, [load, minutes]);

  const formatter = useMemo(
    () => new Intl.NumberFormat(intlLocale(locale)),
    [locale],
  );
  const trendTickFormatter = useMemo(
    () => trendTickDateFormat(locale, minutes),
    [locale, minutes],
  );
  const trendTooltipFormatter = useMemo(
    () => trendTooltipDateFormat(locale, minutes),
    [locale, minutes],
  );
  const trend = data?.trend ?? [];
  const reasons = data?.reasons ?? [];
  const events = data?.events ?? [];
  const configured = data?.configured !== false;
  const trendConfig = useMemo(() => trendChartConfig(copy), [copy]);
  const formatTrendTooltipValue = useMemo(
    () =>
      createTrendTooltipFormatter({
        botRequestsLabel: copy.botRequests,
        botTrafficRatioLabel: copy.botTrafficRatio,
        countFormatter: formatter,
        locale,
      }),
    [copy.botRequests, copy.botTrafficRatio, formatter, locale],
  );

  return (
    <div className="space-y-6 pb-6">
      <div className="relative h-[min(72svh,calc(100svh-10.5rem))] min-h-[18rem] overflow-hidden bg-background sm:min-h-[22rem]">
        <GeoPointsMapIsland
          locale={locale}
          messages={messages}
          points={data?.mapPoints ?? []}
          loading={loading}
          emptyLabel={copy.noData}
          heightClassName="h-full"
          countryHoverEnabled={false}
          pointColor={[239, 68, 68]}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-background via-background/65 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-background via-background/70 to-transparent" />

        <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-col gap-4 lg:inset-x-6 lg:top-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {copy.title}
            </h1>
            <p className="max-w-prose text-sm text-foreground/75">
              {copy.subtitle}
            </p>
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <Select
              value={String(minutes)}
              onValueChange={(value) =>
                setMinutes(Number(value) as WindowMinutes)
              }
            >
              <SelectTrigger className="w-[160px] bg-background/90 backdrop-blur">
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
              className="bg-background/90 backdrop-blur"
              onClick={() => load(minutes, "refresh")}
              disabled={loading || refreshing}
            >
              {refreshing ? (
                <Spinner className="size-4" />
              ) : (
                <RiRefreshLine className="size-4" />
              )}
              {copy.refresh}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] px-4 md:px-6">
        <div className="space-y-6">
          {!configured ? (
            <Card>
              <CardHeader>
                <CardTitle>{copy.notConfiguredTitle}</CardTitle>
                <CardDescription>
                  {copy.notConfiguredDescription}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={`/${locale}/app/manage/system-settings`}>
                    {copy.openSettings}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card className="py-0">
            <CardContent className="p-0">
              <div className="grid gap-px overflow-hidden bg-border/70 md:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  icon={RiRobot2Line}
                  label={copy.botRequests}
                  value={numberFormat(locale, data?.summary.total ?? 0)}
                  detail={windowLabel(messages, minutes)}
                  loading={loading}
                />
                <MetricTile
                  icon={RiRadarLine}
                  label={copy.botRequestRatio}
                  value={percentFormat(
                    locale,
                    data?.summary.botRequestRatio ?? 0,
                  )}
                  detail={copy.rollupBaseline}
                  loading={loading}
                />
                <MetricTile
                  icon={RiShieldCheckLine}
                  label={copy.highConfidenceBots}
                  value={numberFormat(
                    locale,
                    data?.summary.highConfidence ?? 0,
                  )}
                  detail={copy.confidence}
                  loading={loading}
                />
                <MetricTile
                  icon={RiGlobalLine}
                  label={copy.affectedSites}
                  value={numberFormat(locale, data?.summary.affectedSites ?? 0)}
                  detail={copy.site}
                  loading={loading}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{copy.trendTitle}</CardTitle>
              <CardDescription>{copy.trendDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={trendConfig} className="h-[320px] w-full">
                <ComposedChart data={trend}>
                  <defs>
                    <linearGradient
                      id="bot-protection-count-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--color-count)"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-count)"
                        stopOpacity={0.03}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestampMs"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) =>
                      trendTickFormatter.format(new Date(Number(value ?? 0)))
                    }
                    minTickGap={14}
                  />
                  <YAxis
                    yAxisId="bots"
                    width={52}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatter.format(Number(value))}
                  />
                  <YAxis
                    yAxisId="ratio"
                    orientation="right"
                    width={44}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      percentFormat(locale, Number(value))
                    }
                  />
                  <ChartTooltip
                    allowEscapeViewBox={{ x: false, y: true }}
                    wrapperStyle={{ zIndex: 20 }}
                    content={
                      <ChartTooltipContent
                        indicator="dot"
                        labelFormatter={(value, payload) => {
                          const timestamp = Number(
                            payload?.[0]?.payload?.timestampMs ?? value ?? 0,
                          );
                          return trendTooltipFormatter.format(
                            new Date(timestamp),
                          );
                        }}
                        formatter={formatTrendTooltipValue}
                      />
                    }
                  />
                  <Area
                    yAxisId="bots"
                    type="monotone"
                    dataKey="count"
                    stroke="var(--color-count)"
                    fill="url(#bot-protection-count-fill)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    yAxisId="ratio"
                    type="monotone"
                    dataKey="botRatio"
                    stroke="var(--color-botRatio)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{copy.reasonsTitle}</CardTitle>
                <CardDescription>{copy.reasonsDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={REASON_CHART_CONFIG}
                  className="h-[280px] w-full"
                >
                  <BarChart
                    data={reasons}
                    layout="vertical"
                    margin={{ left: 12 }}
                  >
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="reason"
                      width={122}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={compactReason}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="count"
                      fill="var(--color-count)"
                      radius={[0, 3, 3, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{copy.asnTitle}</CardTitle>
              <CardDescription>{copy.asnDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {(data?.asns ?? []).map((asn) => (
                  <div
                    key={asn.asn}
                    className="min-w-0 border border-border/70 p-3"
                  >
                    <p className="truncate font-mono text-sm font-semibold">
                      AS{asn.asn}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {asn.asOrganization || "--"}
                    </p>
                    <p className="mt-3 font-mono text-lg font-semibold">
                      {numberFormat(locale, asn.count)}
                    </p>
                  </div>
                ))}
                {!loading && (data?.asns ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{copy.noData}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{copy.recentTitle}</CardTitle>
              <CardDescription>{copy.recentDescription}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.time}</TableHead>
                    <TableHead>{copy.site}</TableHead>
                    <TableHead>{copy.location}</TableHead>
                    <TableHead>{copy.network}</TableHead>
                    <TableHead>{copy.reason}</TableHead>
                    <TableHead>{copy.request}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={`${event.traceId}:${event.receivedAt}`}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {shortDateTimeWithSeconds(locale, event.receivedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[180px]">
                          <p className="truncate text-sm font-medium">
                            {event.siteName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {event.siteDomain || event.siteId}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[160px]">
                          <p className="truncate text-sm">
                            {formatLocation(event) || "--"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {event.colo || event.continent || "--"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[230px]">
                          <p className="truncate text-sm">{formatAsn(event)}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {copy.ip}: {event.ip || "--"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          <Badge
                            variant={
                              event.confidence === "high"
                                ? "default"
                                : "secondary"
                            }
                            className="capitalize"
                          >
                            {event.confidence || "--"}
                          </Badge>
                          {event.reasons.slice(0, 2).map((reason) => (
                            <Badge key={reason} variant="outline">
                              {compactReason(reason)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[300px]">
                          <p className="truncate font-mono text-xs">
                            {event.pathname || "/"}
                          </p>
                          <p
                            className={cn(
                              "mt-1 truncate text-xs text-muted-foreground",
                              !event.userAgent && "italic",
                            )}
                          >
                            {event.userAgent || copy.userAgent}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && events.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-24 text-center text-muted-foreground"
                      >
                        {copy.noData}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
