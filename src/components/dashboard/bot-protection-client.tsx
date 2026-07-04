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
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import {
  AsyncDimensionBreakdownCard,
  type AsyncDimensionBreakdownLabelAppearance,
  type AsyncDimensionBreakdownRow,
  type AsyncDimensionBreakdownTab,
} from "@/components/dashboard/async-dimension-breakdown-card";
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
import {
  resolveCountryFlagCode,
  resolveCountryLabel,
} from "@/lib/i18n/code-labels";
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
  config?: {
    analyticsEngineDisabled?: boolean;
    analyticsEngineEnableUrl?: string;
  };
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
const DIMENSION_ROW_LIMIT = 30;

type DetectionDimensionTab =
  | "reason"
  | "confidence"
  | "kind"
  | "botScoreBucket"
  | "verifiedBotCategory";
type TargetDimensionTab = "site" | "hostname" | "pathname" | "origin";
type NetworkDimensionTab =
  | "asOrganization"
  | "asn"
  | "country"
  | "region"
  | "city"
  | "colo";
type ClientDimensionTab =
  | "ip"
  | "userAgent"
  | "userAgentLengthBucket"
  | "ipPrefix";

interface BotDimensionRow {
  label: string;
  count: number;
  highConfidence: number;
  sampleEvent: BotEvent | null;
}

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

async function generateDemoBotProtection(
  minutes: WindowMinutes,
  overrides?: Pick<BotProtectionData, "configured" | "error"> & {
    config?: BotProtectionData["config"];
  },
): Promise<BotProtectionData> {
  const { generateDemoBotProtectionData } =
    await import("@/lib/realtime/mock/bot-protection");
  const data = generateDemoBotProtectionData(minutes) as BotProtectionData;
  return {
    ...data,
    ...overrides,
    config: {
      ...(data.config ?? {}),
      ...overrides?.config,
    },
  };
}

function shouldShowDemoOverlay(data: BotProtectionData): boolean {
  return (
    data.config?.analyticsEngineDisabled === true || data.configured === false
  );
}

async function withDemoOverlayData(
  minutes: WindowMinutes,
  data: BotProtectionData,
): Promise<BotProtectionData> {
  if (!shouldShowDemoOverlay(data)) return data;
  return generateDemoBotProtection(minutes, {
    configured: false,
    error: data.error,
    config: data.config,
  });
}

async function fetchBotProtection(
  minutes: WindowMinutes,
): Promise<BotProtectionData> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
    return generateDemoBotProtection(minutes);
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
  return withDemoOverlayData(minutes, payload);
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

function botReasonLabel(
  copy: AppMessages["botProtection"],
  reason: string,
): string {
  return copy.botReasonLabels[reason] ?? compactReason(reason);
}

function emptyValue(copy: AppMessages["botProtection"]): string {
  return copy.emptyValue;
}

function botScoreBucket(score: number | null): string {
  if (score === null) return "";
  if (score < 20) return "1-19";
  if (score < 40) return "20-39";
  if (score < 60) return "40-59";
  if (score < 80) return "60-79";
  return "80-99";
}

function userAgentLengthBucket(length: number): string {
  if (!Number.isFinite(length) || length <= 0) return "";
  if (length < 80) return "1-79";
  if (length < 160) return "80-159";
  if (length < 256) return "160-255";
  if (length < 512) return "256-511";
  return "512+";
}

function ipPrefix(ip: string): string {
  const value = ip.trim();
  const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0/24`;
  if (value.includes(":")) {
    const parts = value.split(":").filter(Boolean);
    if (parts.length >= 4) return `${parts.slice(0, 4).join(":")}::/64`;
  }
  return value;
}

function valuesForDetectionTab(
  event: BotEvent,
  tab: DetectionDimensionTab,
  copy: AppMessages["botProtection"],
): string[] {
  if (tab === "reason") {
    return event.reasons.map((reason) => botReasonLabel(copy, reason));
  }
  if (tab === "confidence") return [event.confidence];
  if (tab === "kind") return [event.kind];
  if (tab === "botScoreBucket") return [botScoreBucket(event.botScore)];
  return [event.verifiedBotCategory];
}

function valuesForTargetTab(
  event: BotEvent,
  tab: TargetDimensionTab,
): string[] {
  if (tab === "site") {
    return [event.siteName || event.siteDomain || event.siteId];
  }
  if (tab === "hostname") return [event.hostname];
  if (tab === "pathname") return [event.pathname || "/"];
  return [event.origin];
}

function valuesForNetworkTab(
  event: BotEvent,
  tab: NetworkDimensionTab,
): string[] {
  if (tab === "asOrganization") return [event.asOrganization];
  if (tab === "asn") return [event.asn ? `AS${event.asn}` : ""];
  if (tab === "country") return [event.country];
  if (tab === "region") return [event.region];
  if (tab === "city") return [event.city];
  return [event.colo];
}

function valuesForClientTab(
  event: BotEvent,
  tab: ClientDimensionTab,
): string[] {
  if (tab === "ip") return [event.ip];
  if (tab === "userAgent") return [event.userAgent];
  if (tab === "userAgentLengthBucket") {
    return [userAgentLengthBucket(event.userAgentLength)];
  }
  return [ipPrefix(event.ip)];
}

function aggregateDimensionRows(
  events: BotEvent[],
  copy: AppMessages["botProtection"],
  resolveValues: (event: BotEvent) => string[],
): BotDimensionRow[] {
  const rowMap = new Map<
    string,
    { count: number; highConfidence: number; sampleEvent: BotEvent | null }
  >();

  for (const event of events) {
    const values = resolveValues(event)
      .map((value) => value.trim())
      .filter(Boolean);
    const normalizedValues = values.length > 0 ? values : [emptyValue(copy)];
    for (const value of normalizedValues) {
      const current = rowMap.get(value) ?? {
        count: 0,
        highConfidence: 0,
        sampleEvent: event,
      };
      current.count += 1;
      if (event.confidence === "high") current.highConfidence += 1;
      current.sampleEvent ??= event;
      rowMap.set(value, current);
    }
  }

  return Array.from(rowMap.entries())
    .map(([label, row]) => ({
      label,
      count: row.count,
      highConfidence: row.highConfidence,
      sampleEvent: row.sampleEvent,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.highConfidence - left.highConfidence ||
        left.label.localeCompare(right.label),
    )
    .slice(0, DIMENSION_ROW_LIMIT);
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

function faviconLabelForEvent(
  event: BotEvent | null,
  tab: TargetDimensionTab,
): string | undefined {
  if (!event) return undefined;
  if (tab === "site") return event.siteDomain || event.hostname || event.origin;
  if (tab === "hostname") return event.hostname || event.siteDomain;
  if (tab === "origin")
    return event.origin || event.hostname || event.siteDomain;
  return undefined;
}

function countryFlagAppearance(
  rawCountry: string,
  locale: Locale,
  unknownLabel: string,
): {
  label: string;
  appearance: AsyncDimensionBreakdownLabelAppearance | undefined;
} {
  const country = resolveCountryLabel(rawCountry, locale, unknownLabel);
  const flagCode = resolveCountryFlagCode(country.code, locale);
  return {
    label: country.label,
    appearance: {
      type: "leadingIcon",
      iconName: flagCode ? `flagpack:${flagCode.toLowerCase()}` : null,
    },
  };
}

function regionAppearance(
  row: BotDimensionRow,
  locale: Locale,
  unknownLabel: string,
): AsyncDimensionBreakdownLabelAppearance | undefined {
  const event = row.sampleEvent;
  if (!event) return undefined;
  const country = resolveCountryLabel(event.country, locale, unknownLabel);
  const flagCode = resolveCountryFlagCode(country.code, locale);
  const regionLabel = row.label.trim() || event.region.trim() || unknownLabel;
  const hasRegion = Boolean(event.region.trim());

  return {
    type: "geoRegion",
    countryLabel: country.label,
    countryIconName: flagCode ? `flagpack:${flagCode.toLowerCase()}` : null,
    regionLabel,
    countryCode: country.code ?? event.country,
    stateCode: event.region,
    hideRegion: !hasRegion,
  };
}

function cityAppearance(
  row: BotDimensionRow,
  locale: Locale,
  unknownLabel: string,
): AsyncDimensionBreakdownLabelAppearance | undefined {
  const event = row.sampleEvent;
  if (!event) return undefined;
  const country = resolveCountryLabel(event.country, locale, unknownLabel);
  const flagCode = resolveCountryFlagCode(country.code, locale);
  const regionLabel = event.region.trim() || unknownLabel;
  const cityLabel = row.label.trim() || event.city.trim() || unknownLabel;
  const hasRegion = Boolean(event.region.trim());
  const hasCity = Boolean(event.city.trim());

  return {
    type: "geoCity",
    countryLabel: country.label,
    countryIconName: flagCode ? `flagpack:${flagCode.toLowerCase()}` : null,
    regionLabel,
    cityLabel,
    countryCode: country.code ?? event.country,
    stateCode: event.region,
    cityNameDefault: event.city,
    hideRegion: !hasRegion,
    hideCity: !hasCity,
  };
}

function toAsyncDimensionRows(
  rows: BotDimensionRow[],
  options?: {
    targetTab?: TargetDimensionTab;
    networkTab?: NetworkDimensionTab;
    locale?: Locale;
    unknownLabel?: string;
  },
): AsyncDimensionBreakdownRow[] {
  return rows.map((row) => ({
    key: row.label,
    label:
      options?.networkTab === "country" &&
      options.locale &&
      options.unknownLabel
        ? countryFlagAppearance(row.label, options.locale, options.unknownLabel)
            .label
        : row.label,
    views: row.count,
    visitors: row.highConfidence,
    mono: row.label.includes("/") || row.label.includes(":"),
    labelAppearance:
      options?.targetTab && options.targetTab !== "pathname"
        ? {
            type: "favicon",
            iconLabel: faviconLabelForEvent(row.sampleEvent, options.targetTab),
          }
        : options?.networkTab === "country" &&
            options.locale &&
            options.unknownLabel
          ? countryFlagAppearance(
              row.label,
              options.locale,
              options.unknownLabel,
            ).appearance
          : options?.networkTab === "region" &&
              options.locale &&
              options.unknownLabel
            ? regionAppearance(row, options.locale, options.unknownLabel)
            : options?.networkTab === "city" &&
                options.locale &&
                options.unknownLabel
              ? cityAppearance(row, options.locale, options.unknownLabel)
              : undefined,
  }));
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
  const events = data?.events ?? [];
  const analyticsEngineDisabled =
    data?.config?.analyticsEngineDisabled === true;
  const configured = !analyticsEngineDisabled && data?.configured !== false;
  const showDemoOverlay =
    Boolean(data) && !loading && (analyticsEngineDisabled || !configured);
  const overlayTitle = analyticsEngineDisabled
    ? copy.analyticsEngineDisabledTitle
    : copy.notConfiguredTitle;
  const overlayDescription = analyticsEngineDisabled
    ? copy.analyticsEngineDisabledDescription
    : copy.notConfiguredDescription;
  const overlayAction = analyticsEngineDisabled ? (
    <Button asChild>
      <a
        href={data?.config?.analyticsEngineEnableUrl || "#"}
        target="_blank"
        rel="noreferrer"
      >
        {copy.openAnalyticsEngine}
      </a>
    </Button>
  ) : (
    <Button asChild>
      <Link href={`/${locale}/app/manage/system-settings`}>
        {copy.openSettings}
      </Link>
    </Button>
  );
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
  const detectionTabs = useMemo(
    () =>
      [
        {
          value: "reason",
          label: copy.reason,
          columnLabel: copy.reason,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "confidence",
          label: copy.confidence,
          columnLabel: copy.confidence,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "kind",
          label: copy.kind,
          columnLabel: copy.kind,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "botScoreBucket",
          label: copy.botScoreBucket,
          columnLabel: copy.botScoreBucket,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "verifiedBotCategory",
          label: copy.verifiedBotCategory,
          columnLabel: copy.verifiedBotCategory,
          primaryMetricLabel: copy.blocked,
        },
      ] satisfies [
        AsyncDimensionBreakdownTab<DetectionDimensionTab>,
        ...AsyncDimensionBreakdownTab<DetectionDimensionTab>[],
      ],
    [copy],
  );
  const targetTabs = useMemo(
    () =>
      [
        {
          value: "site",
          label: copy.site,
          columnLabel: copy.site,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "hostname",
          label: copy.hostname,
          columnLabel: copy.hostname,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "pathname",
          label: copy.pathname,
          columnLabel: copy.pathname,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "origin",
          label: copy.origin,
          columnLabel: copy.origin,
          primaryMetricLabel: copy.blocked,
        },
      ] satisfies [
        AsyncDimensionBreakdownTab<TargetDimensionTab>,
        ...AsyncDimensionBreakdownTab<TargetDimensionTab>[],
      ],
    [copy],
  );
  const networkTabs = useMemo(
    () =>
      [
        {
          value: "asOrganization",
          label: copy.asOrganization,
          columnLabel: copy.asOrganization,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "asn",
          label: copy.asn,
          columnLabel: copy.asn,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "country",
          label: copy.country,
          columnLabel: copy.country,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "region",
          label: copy.region,
          columnLabel: copy.region,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "city",
          label: copy.city,
          columnLabel: copy.city,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "colo",
          label: copy.colo,
          columnLabel: copy.colo,
          primaryMetricLabel: copy.blocked,
        },
      ] satisfies [
        AsyncDimensionBreakdownTab<NetworkDimensionTab>,
        ...AsyncDimensionBreakdownTab<NetworkDimensionTab>[],
      ],
    [copy],
  );
  const clientTabs = useMemo(
    () =>
      [
        {
          value: "ip",
          label: copy.ip,
          columnLabel: copy.ip,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "userAgent",
          label: copy.userAgent,
          columnLabel: copy.userAgent,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "userAgentLengthBucket",
          label: copy.userAgentLengthBucket,
          columnLabel: copy.userAgentLengthBucket,
          primaryMetricLabel: copy.blocked,
        },
        {
          value: "ipPrefix",
          label: copy.ipPrefix,
          columnLabel: copy.ipPrefix,
          primaryMetricLabel: copy.blocked,
        },
      ] satisfies [
        AsyncDimensionBreakdownTab<ClientDimensionTab>,
        ...AsyncDimensionBreakdownTab<ClientDimensionTab>[],
      ],
    [copy],
  );
  const loadDetectionRows = useMemo(
    () => async (tab: DetectionDimensionTab) =>
      toAsyncDimensionRows(
        aggregateDimensionRows(events, copy, (event) =>
          valuesForDetectionTab(event, tab, copy),
        ),
      ),
    [copy, events],
  );
  const loadTargetRows = useMemo(
    () => async (tab: TargetDimensionTab) =>
      toAsyncDimensionRows(
        aggregateDimensionRows(events, copy, (event) =>
          valuesForTargetTab(event, tab),
        ),
        { targetTab: tab },
      ),
    [copy, events],
  );
  const loadNetworkRows = useMemo(
    () => async (tab: NetworkDimensionTab) =>
      toAsyncDimensionRows(
        aggregateDimensionRows(events, copy, (event) =>
          valuesForNetworkTab(event, tab),
        ),
        {
          networkTab: tab,
          locale,
          unknownLabel: copy.emptyValue,
        },
      ),
    [copy, events, locale],
  );
  const loadClientRows = useMemo(
    () => async (tab: ClientDimensionTab) =>
      toAsyncDimensionRows(
        aggregateDimensionRows(events, copy, (event) =>
          valuesForClientTab(event, tab),
        ),
      ),
    [copy, events],
  );

  return (
    <div className="space-y-6 pb-6">
      <div className="pointer-events-none relative z-20 mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 pt-4 md:px-6 lg:flex-row lg:items-start lg:justify-between">
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

      <div className="relative">
        <div
          aria-hidden={showDemoOverlay}
          className={cn(
            "space-y-6 transition duration-200",
            showDemoOverlay && "pointer-events-none select-none blur-sm",
          )}
        >
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
              projectionMode="globe"
              autoRotate
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-background via-background/65 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-background via-background/70 to-transparent" />
          </div>

          <div className="mx-auto w-full max-w-[1400px] px-4 md:px-6">
            <div className="space-y-6">
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
                      value={numberFormat(
                        locale,
                        data?.summary.affectedSites ?? 0,
                      )}
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
                  <ChartContainer
                    config={trendConfig}
                    className="h-[320px] w-full"
                  >
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
                          trendTickFormatter.format(
                            new Date(Number(value ?? 0)),
                          )
                        }
                        minTickGap={14}
                      />
                      <YAxis
                        yAxisId="bots"
                        width={52}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          formatter.format(Number(value))
                        }
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
                                payload?.[0]?.payload?.timestampMs ??
                                  value ??
                                  0,
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

              <section className="grid gap-4 xl:grid-cols-2">
                <AsyncDimensionBreakdownCard
                  locale={locale}
                  messages={messages}
                  tabs={detectionTabs}
                  loadRows={loadDetectionRows}
                  requestKey={`${minutes}:${events.length}:detection`}
                  className="h-full"
                  secondaryMetricLabel={copy.highConfidenceRequests}
                  emptyLabel={copy.noData}
                />
                <AsyncDimensionBreakdownCard
                  locale={locale}
                  messages={messages}
                  tabs={targetTabs}
                  loadRows={loadTargetRows}
                  requestKey={`${minutes}:${events.length}:target`}
                  className="h-full"
                  secondaryMetricLabel={copy.highConfidenceRequests}
                  emptyLabel={copy.noData}
                />
                <AsyncDimensionBreakdownCard
                  locale={locale}
                  messages={messages}
                  tabs={networkTabs}
                  loadRows={loadNetworkRows}
                  requestKey={`${minutes}:${events.length}:network`}
                  className="h-full"
                  secondaryMetricLabel={copy.highConfidenceRequests}
                  emptyLabel={copy.noData}
                />
                <AsyncDimensionBreakdownCard
                  locale={locale}
                  messages={messages}
                  tabs={clientTabs}
                  loadRows={loadClientRows}
                  requestKey={`${minutes}:${events.length}:client`}
                  className="h-full"
                  secondaryMetricLabel={copy.highConfidenceRequests}
                  emptyLabel={copy.noData}
                />
              </section>

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
                              <p className="truncate text-sm">
                                {formatAsn(event)}
                              </p>
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
                                  {botReasonLabel(copy, reason)}
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

        {showDemoOverlay ? (
          <div className="absolute inset-0 z-30 bg-background/30 px-4">
            <div className="sticky top-[calc(50svh-8rem)] mx-auto flex w-full max-w-lg justify-center py-10">
              <Card
                role="dialog"
                aria-modal="true"
                aria-labelledby="bot-protection-overlay-title"
                aria-describedby="bot-protection-overlay-description"
                className="w-full border-border/80 bg-background/95 shadow-2xl backdrop-blur"
              >
                <CardHeader>
                  <CardTitle id="bot-protection-overlay-title">
                    {overlayTitle}
                  </CardTitle>
                  <CardDescription id="bot-protection-overlay-description">
                    {overlayDescription}
                  </CardDescription>
                </CardHeader>
                <CardContent>{overlayAction}</CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
