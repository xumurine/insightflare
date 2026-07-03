"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  RiGlobalLine,
  RiRadarLine,
  RiRefreshLine,
  RiRobot2Line,
  RiServerLine,
  RiShieldCheckLine,
} from "@remixicon/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { GeoPointsMapIsland } from "@/components/dashboard/geo-points-map-island";
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
    highConfidence: number;
    mediumConfidence: number;
    uniqueAsns: number;
    uniqueCountries: number;
  };
  mapPoints: Array<{
    latitude: number;
    longitude: number;
    country: string;
    pointCount: number;
  }>;
  trend: Array<{ timestampMs: number; count: number }>;
  reasons: Array<{ reason: string; count: number }>;
  asns: Array<{ asn: number; asOrganization: string; count: number }>;
  events: BotEvent[];
}

type WindowMinutes = 60 | 360 | 1440 | 10080;

const WINDOW_OPTIONS: readonly WindowMinutes[] = [60, 360, 1440, 10080];

const TREND_CHART_CONFIG = {
  count: {
    label: "Bots",
    color: "var(--color-chart-1)",
  },
} satisfies ChartConfig;

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
    const now = Date.now();
    return {
      ok: true,
      configured: true,
      generatedAt: now,
      window: {
        minutes,
        from: now - minutes * 60 * 1000,
        to: now,
      },
      summary: {
        total: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        uniqueAsns: 0,
        uniqueCountries: 0,
      },
      mapPoints: [],
      trend: [],
      reasons: [],
      asns: [],
      events: [],
    };
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
  if (minutes === 360) return messages.botProtection.range6h;
  if (minutes === 10080) return messages.botProtection.range7d;
  return messages.botProtection.range24h;
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
  return (
    <div className="min-w-0 border border-border/70 bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="truncate text-[11px] uppercase">{label}</span>
      </div>
      <AutoTransition
        transitionKey={loading ? "loading" : value}
        type="fade"
        duration={0.18}
      >
        {loading ? (
          <div className="mt-3 flex h-8 items-center">
            <Spinner className="size-5" />
          </div>
        ) : (
          <p className="mt-3 truncate font-mono text-2xl leading-8 font-semibold tabular-nums">
            {value}
          </p>
        )}
      </AutoTransition>
      <p className="mt-2 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function BotProtectionClient({
  locale,
  messages,
}: BotProtectionClientProps) {
  const copy = messages.botProtection;
  const [minutes, setMinutes] = useState<WindowMinutes>(1440);
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
  const trend = data?.trend ?? [];
  const reasons = data?.reasons ?? [];
  const events = data?.events ?? [];
  const configured = data?.configured !== false;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <PageHeading title={copy.title} subtitle={copy.subtitle} />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(minutes)}
            onValueChange={(value) =>
              setMinutes(Number(value) as WindowMinutes)
            }
          >
            <SelectTrigger className="w-[160px]">
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

      {!configured ? (
        <Card>
          <CardHeader>
            <CardTitle>{copy.notConfiguredTitle}</CardTitle>
            <CardDescription>{copy.notConfiguredDescription}</CardDescription>
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricTile
          icon={RiRobot2Line}
          label={copy.total}
          value={numberFormat(locale, data?.summary.total ?? 0)}
          detail={windowLabel(messages, minutes)}
          loading={loading}
        />
        <MetricTile
          icon={RiShieldCheckLine}
          label={copy.highConfidence}
          value={numberFormat(locale, data?.summary.highConfidence ?? 0)}
          detail={copy.confidence}
          loading={loading}
        />
        <MetricTile
          icon={RiServerLine}
          label={copy.mediumConfidence}
          value={numberFormat(locale, data?.summary.mediumConfidence ?? 0)}
          detail={copy.uniqueAsns}
          loading={loading}
        />
        <MetricTile
          icon={RiRadarLine}
          label={copy.uniqueAsns}
          value={numberFormat(locale, data?.summary.uniqueAsns ?? 0)}
          detail={copy.network}
          loading={loading}
        />
        <MetricTile
          icon={RiGlobalLine}
          label={copy.uniqueCountries}
          value={numberFormat(locale, data?.summary.uniqueCountries ?? 0)}
          detail={copy.location}
          loading={loading}
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{copy.mapTitle}</CardTitle>
          <CardDescription>{copy.mapDescription}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <GeoPointsMapIsland
            locale={locale}
            messages={messages}
            points={data?.mapPoints ?? []}
            loading={loading}
            emptyLabel={copy.noData}
            heightClassName="h-[420px]"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{copy.trendTitle}</CardTitle>
            <CardDescription>{copy.trendDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={TREND_CHART_CONFIG}
              className="h-[280px] w-full"
            >
              <LineChart data={trend}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="timestampMs"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    shortDateTimeWithSeconds(locale, value)
                  }
                  minTickGap={28}
                />
                <YAxis
                  width={44}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatter.format(Number(value))}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) =>
                        shortDateTimeWithSeconds(locale, Number(value))
                      }
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-count)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

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
              <BarChart data={reasons} layout="vertical" margin={{ left: 12 }}>
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
                          event.confidence === "high" ? "default" : "secondary"
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
  );
}
