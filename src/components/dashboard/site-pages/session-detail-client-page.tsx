"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Map, { useControl } from "react-map-gl/maplibre";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiCalendarEventLine,
  RiFileCopyLine,
  RiPulseLine,
  RiTimeLine,
  RiUserLine,
} from "@remixicon/react";
import type { StyleSpecification } from "maplibre-gl";

import {
  BrowserMeta,
  DeviceMeta,
  formatDuration,
  formatPath,
  formatScreen,
  formatShortDateTime,
  LocationMeta,
  OsMeta,
  ReferrerMeta,
  VisitorAvatar,
} from "@/components/dashboard/journey-display";
import { LazyGeoCityBreadcrumbLabel } from "@/components/dashboard/lazy-geo-location-label";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchSessionDetail } from "@/lib/dashboard/client-data";
import { numberFormat } from "@/lib/dashboard/format";
import { buildPageDetailHref } from "@/lib/dashboard/page-detail";
import type {
  JourneyEvent,
  JourneyEventCount,
  JourneyPageCount,
  JourneySession,
  SessionDetailData,
} from "@/lib/edge-client";
import {
  resolveCountryFlagCode,
  resolveCountryLabel,
} from "@/lib/i18n/code-labels";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

interface SessionDetailClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

type SessionDetail = NonNullable<SessionDetailData["data"]>;
type Labels = ReturnType<typeof copy>;
type EffectiveMapTheme = "light" | "dark";

const SESSION_MAP_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 1.05,
  minZoom: 0.3,
  maxZoom: 6,
  pitch: 0,
  bearing: 0,
} as const;
const SESSION_MAP_MAX_RENDERED_POINTS = 320;
const SESSION_MAP_POINT_RGB = [52, 211, 153] as const;
const SESSION_MAP_POINT_BASE_RADIUS_PX = 4.8;

interface SessionLocationPoint {
  latitude: number;
  longitude: number;
  timestampMs: number;
}

interface RenderedSessionLocationPoint extends SessionLocationPoint {
  id: string;
  radius: number;
  fillColor: [number, number, number, number];
}

function buildRasterStyle(theme: EffectiveMapTheme): StyleSpecification {
  const sourceId = `insightflare-session-map-source-${theme}`;
  const layerId = `insightflare-session-map-layer-${theme}`;
  const endpoint = `/api/map-tiles/{z}/{x}/{y}.png?theme=${theme}`;

  return {
    version: 8,
    name: `insightflare-session-map-${theme}`,
    sources: {
      [sourceId]: {
        type: "raster",
        tiles: [endpoint],
        tileSize: 256,
        attribution: "OpenStreetMap contributors CARTO",
      },
    },
    layers: [
      {
        id: layerId,
        type: "raster",
        source: sourceId,
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  };
}

function hasValidCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return false;
  }
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function resolveSessionMapFillColor(
  opacity: number,
): [number, number, number, number] {
  return [
    SESSION_MAP_POINT_RGB[0],
    SESSION_MAP_POINT_RGB[1],
    SESSION_MAP_POINT_RGB[2],
    Math.round(Math.max(0, Math.min(1, opacity)) * 255),
  ];
}

function getRenderedSessionPointPosition(
  point: Pick<RenderedSessionLocationPoint, "longitude" | "latitude">,
): [number, number] {
  return [point.longitude, point.latitude];
}

function sessionLocationPoint(
  session: JourneySession,
): SessionLocationPoint | null {
  const latitude = session.latitude;
  const longitude = session.longitude;
  return hasValidCoordinate(latitude, longitude) &&
    typeof latitude === "number" &&
    typeof longitude === "number"
    ? {
        latitude,
        longitude,
        timestampMs: session.startedAt,
      }
    : null;
}

function sessionLocationPoints(
  rawPoints: SessionDetail["locationPoints"] | undefined,
  session: JourneySession,
): SessionLocationPoint[] {
  const points = (rawPoints ?? []).flatMap((point) =>
    hasValidCoordinate(point.latitude, point.longitude)
      ? [
          {
            latitude: point.latitude,
            longitude: point.longitude,
            timestampMs: point.timestampMs,
          },
        ]
      : [],
  );
  if (points.length > 0) return points;
  const fallback = sessionLocationPoint(session);
  return fallback ? [fallback] : [];
}

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

function SessionMapStage({
  mapStyle,
  points,
}: {
  mapStyle: StyleSpecification;
  points: SessionLocationPoint[];
}) {
  const renderedPoints = useMemo<RenderedSessionLocationPoint[]>(
    () =>
      points.slice(0, SESSION_MAP_MAX_RENDERED_POINTS).map((point, index) => ({
        ...point,
        id: `${point.timestampMs}:${index}`,
        radius: SESSION_MAP_POINT_BASE_RADIUS_PX,
        fillColor: resolveSessionMapFillColor(0.56),
      })),
    [points],
  );
  const layers = useMemo(
    () => [
      new ScatterplotLayer<RenderedSessionLocationPoint>({
        id: "session-location-point",
        data: renderedPoints,
        getFillColor: (point) => point.fillColor,
        getPosition: getRenderedSessionPointPosition,
        getRadius: (point) => point.radius,
        radiusUnits: "pixels",
        radiusMinPixels: 0,
        radiusMaxPixels: SESSION_MAP_POINT_BASE_RADIUS_PX,
        pickable: false,
      }),
    ],
    [renderedPoints],
  );

  return (
    <Map
      initialViewState={SESSION_MAP_VIEW_STATE}
      mapStyle={mapStyle}
      attributionControl={false}
      interactive={false}
      reuseMaps
    >
      <DeckOverlay interleaved={false} layers={layers} />
    </Map>
  );
}

function copy(locale: Locale) {
  return locale === "zh"
    ? {
        titlePrefix: "会话",
        anonymous: "匿名访客",
        back: "返回会话",
        missing: "缺少 sessionId。",
        notFound: "没有找到这个会话。",
        loadError: "无法加载会话详情。",
        overview: "总览",
        journey: "旅程",
        eventsTab: "事件",
        properties: "属性",
        active: "进行中",
        inactive: "已结束",
        engaged: "有效访问",
        duration: "时长",
        createdAt: "创建时间",
        endedAt: "结束时间",
        screenViews: "页面浏览",
        events: "事件",
        bounce: "跳出",
        entryPath: "入口路径",
        exitPath: "退出路径",
        referrerName: "来源名称",
        country: "国家",
        region: "地区",
        city: "城市",
        os: "系统",
        browser: "浏览器",
        device: "设备",
        screen: "屏幕",
        visitedPages: "访问页面",
        eventDistribution: "事件分布",
        yes: "是",
        no: "否",
        copied: "已复制",
        copySessionId: "复制会话 ID",
        copyVisitorId: "复制访客 ID",
        viewVisitor: "查看访客",
        route: "访问路径",
        routeSubtitle: "从入口页到退出页的会话边界。",
        uniquePages: "唯一页面",
        pageEvents: "页面事件",
        customEvents: "自定义事件",
        firstEvent: "首个事件",
        lastEvent: "最后事件",
        sessionStarted: "会话开始",
        pageview: "访问页面",
        customEvent: "自定义事件",
        timelineTitle: "会话旅程",
        timelineSubtitle: "按发生顺序展示该会话内的页面访问和自定义事件。",
        allEventsTitle: "完整事件流",
        allEventsSubtitle: "点击任一事件查看原始上下文。",
        propertiesTitle: "会话属性",
        propertiesSubtitle: "身份、来源、设备和地理上下文。",
        identityTiming: "身份与时间",
        attribution: "来源",
        client: "客户端",
        location: "位置",
        eventDetails: "事件详情",
        eventInformation: "事件信息",
        eventId: "事件 ID",
        eventType: "事件类型",
        eventKind: "事件种类",
        occurredAt: "发生时间",
        visitorId: "访客 ID",
        sessionId: "会话 ID",
        visitId: "访问 ID",
        title: "标题",
        path: "路径",
        hostname: "主机名",
        referrerUrl: "来源链接",
        emptyPages: "没有页面访问记录。",
        emptyEvents: "没有事件记录。",
        emptyDistribution: "没有事件分布数据。",
        sincePrevious: "距上个事件",
      }
    : {
        titlePrefix: "Session",
        anonymous: "Anonymous",
        back: "Back to sessions",
        missing: "Missing sessionId.",
        notFound: "Session not found.",
        loadError: "Unable to load session detail.",
        overview: "Overview",
        journey: "Journey",
        eventsTab: "Events",
        properties: "Properties",
        active: "Active",
        inactive: "Ended",
        engaged: "Engaged",
        duration: "Duration",
        createdAt: "Created At",
        endedAt: "Ended At",
        screenViews: "Screen Views",
        events: "Events",
        bounce: "Bounce",
        entryPath: "Entry Path",
        exitPath: "Exit Path",
        referrerName: "Referrer Name",
        country: "Country",
        region: "Region",
        city: "City",
        os: "OS",
        browser: "Browser",
        device: "Device",
        screen: "Screen",
        visitedPages: "Visited pages",
        eventDistribution: "Event distribution",
        yes: "Yes",
        no: "No",
        copied: "Copied",
        copySessionId: "Copy session ID",
        copyVisitorId: "Copy visitor ID",
        viewVisitor: "View visitor",
        route: "Visit route",
        routeSubtitle: "Session boundary from entry page to exit page.",
        uniquePages: "Unique Pages",
        pageEvents: "Page Events",
        customEvents: "Custom Events",
        firstEvent: "First Event",
        lastEvent: "Last Event",
        sessionStarted: "Session started",
        pageview: "Pageview",
        customEvent: "Custom event",
        timelineTitle: "Session journey",
        timelineSubtitle:
          "Pageviews and custom events in the order they happened.",
        allEventsTitle: "Full event stream",
        allEventsSubtitle: "Select any event to inspect its raw context.",
        propertiesTitle: "Session properties",
        propertiesSubtitle: "Identity, source, device, and location context.",
        identityTiming: "Identity & timing",
        attribution: "Attribution",
        client: "Client",
        location: "Location",
        eventDetails: "Event details",
        eventInformation: "Event information",
        eventId: "Event ID",
        eventType: "Event Type",
        eventKind: "Event Kind",
        occurredAt: "Occurred At",
        visitorId: "Visitor ID",
        sessionId: "Session ID",
        visitId: "Visit ID",
        title: "Title",
        path: "Path",
        hostname: "Hostname",
        referrerUrl: "Referrer URL",
        emptyPages: "No page views recorded.",
        emptyEvents: "No events recorded.",
        emptyDistribution: "No event distribution data.",
        sincePrevious: "Since previous",
      };
}

function shortId(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 10)}...`;
}

function eventKindLabel(labels: Labels, event: JourneyEvent): string {
  if (event.kind === "session_start") return labels.sessionStarted;
  if (event.kind === "pageview") return labels.pageview;
  return labels.customEvent;
}

function eventTitle(labels: Labels, event: JourneyEvent): string {
  if (event.kind === "session_start") return labels.sessionStarted;
  if (event.kind === "pageview") return formatPath(event.pathname);
  return event.eventType.trim() || labels.customEvent;
}

function eventSubtitle(event: JourneyEvent, unknownLabel: string): string {
  return (
    event.title.trim() ||
    event.hostname.trim() ||
    event.visitId.trim() ||
    unknownLabel
  );
}

function CopyButton({
  value,
  label,
  copiedLabel,
}: {
  value: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const normalized = value.trim();
    if (!normalized || !navigator.clipboard?.writeText) return;

    void navigator.clipboard.writeText(normalized).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      disabled={!value.trim()}
    >
      <RiFileCopyLine data-icon="inline-start" />
      {copied ? copiedLabel : label}
    </Button>
  );
}

function EventIcon({ event }: { event: JourneyEvent }) {
  const isCustom = event.kind === "custom";
  const isSessionStart = event.kind === "session_start";
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-none",
        isSessionStart && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        event.kind === "pageview" &&
          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        isCustom && "bg-sky-500/15 text-sky-600 dark:text-sky-400",
      )}
    >
      {isSessionStart ? (
        <RiTimeLine className="size-4" />
      ) : isCustom ? (
        <RiPulseLine className="size-4" />
      ) : (
        <RiCalendarEventLine className="size-4" />
      )}
    </span>
  );
}

function MetricTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 border-border/70 p-4 ring-1 ring-foreground/10">
      <p className="text-[11px] leading-snug text-muted-foreground">{label}</p>
      <div className="mt-2 min-w-0 break-words font-mono text-xl font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">
        {value}
      </div>
    </div>
  );
}

function DetailValue({
  children,
  mono = false,
}: {
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center justify-end gap-2 break-words text-right text-[11px] text-foreground",
        mono && "font-mono",
      )}
    >
      <span className="min-w-0 break-all">{children}</span>
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid min-h-10 items-start gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="min-w-0 text-left text-[11px] text-foreground sm:text-right">
        {value}
      </div>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <div className="divide-y divide-border/70">{children}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-24 items-center justify-center border border-dashed border-border px-4 py-6 text-center text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}

function PageMetricRows({
  locale,
  labels,
  pages,
  total,
  pagesPath,
}: {
  locale: Locale;
  labels: Labels;
  pages: JourneyPageCount[];
  total: number;
  pagesPath: string;
}) {
  if (pages.length === 0) {
    return <EmptyState>{labels.emptyPages}</EmptyState>;
  }

  const max = Math.max(1, ...pages.map((page) => page.views));

  return (
    <div className="space-y-2">
      {pages.map((page) => {
        const percent = total > 0 ? page.views / total : page.views / max;
        return (
          <Link
            key={page.pathname}
            href={buildPageDetailHref(pagesPath, page.pathname)}
            className="group block border border-border/70 bg-card px-3 py-2 outline-none transition-colors hover:bg-muted/35 focus-visible:ring-1 focus-visible:ring-ring/60"
          >
            <div className="flex items-center justify-between gap-4">
              <span className="min-w-0 truncate font-mono text-foreground">
                {formatPath(page.pathname)}
              </span>
              <span className="shrink-0 font-mono text-muted-foreground">
                {numberFormat(locale, page.views)}
              </span>
            </div>
            <div className="mt-2 h-1 bg-muted">
              <div
                className="h-full bg-emerald-500/70 transition-[width]"
                style={{ width: `${Math.max(5, Math.round(percent * 100))}%` }}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function EventDistributionRows({
  locale,
  labels,
  events,
}: {
  locale: Locale;
  labels: Labels;
  events: JourneyEventCount[];
}) {
  if (events.length === 0) {
    return <EmptyState>{labels.emptyDistribution}</EmptyState>;
  }

  const max = Math.max(1, ...events.map((event) => event.count));

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div
          key={event.eventType}
          className="border border-border/70 bg-card px-3 py-2"
        >
          <div className="flex items-center justify-between gap-4">
            <span className="min-w-0 truncate text-foreground">
              {event.eventType}
            </span>
            <span className="shrink-0 font-mono text-muted-foreground">
              {numberFormat(locale, event.count)}
            </span>
          </div>
          <div className="mt-2 h-1 bg-muted">
            <div
              className="h-full bg-sky-500/70 transition-[width]"
              style={{
                width: `${Math.max(5, Math.round((event.count / max) * 100))}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionGeoBreadcrumb({
  locale,
  messages,
  session,
}: {
  locale: Locale;
  messages: AppMessages;
  session: JourneySession;
}) {
  const country = resolveCountryLabel(
    session.country,
    locale,
    messages.common.unknown,
  );
  const flagCode = resolveCountryFlagCode(country.code, locale);
  const regionLabel =
    session.region.trim() ||
    session.regionCode.trim() ||
    messages.common.unknown;
  const cityLabel = session.city.trim() || messages.common.unknown;
  const hasRegion = Boolean(session.region.trim() || session.regionCode.trim());
  const hasCity = Boolean(session.city.trim());

  return (
    <LazyGeoCityBreadcrumbLabel
      locale={locale}
      countryLabel={country.label}
      countryIconName={flagCode ? `flagpack:${flagCode.toLowerCase()}` : null}
      regionLabel={regionLabel}
      cityLabel={cityLabel}
      countryCode={country.code ?? session.country}
      stateCode={session.regionCode || session.region}
      cityNameDefault={session.city}
      hideRegion={!hasRegion}
      hideCity={!hasCity}
    />
  );
}

function SessionMapHero({
  labels,
  session,
  locationPoints,
  backHref,
}: {
  labels: Labels;
  session: JourneySession;
  locationPoints: SessionDetail["locationPoints"] | undefined;
  backHref: string;
}) {
  const { resolvedTheme } = useTheme();
  const effectiveTheme: EffectiveMapTheme =
    resolvedTheme === "dark" ? "dark" : "light";
  const mapStyle = useMemo(
    () => buildRasterStyle(effectiveTheme),
    [effectiveTheme],
  );
  const points = useMemo(
    () => sessionLocationPoints(locationPoints, session),
    [locationPoints, session],
  );

  return (
    <div className="relative h-[17rem] overflow-hidden sm:h-[19rem]">
      <SessionMapStage mapStyle={mapStyle} points={points} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-background via-background/70 to-transparent" />

      <Link
        href={backHref}
        className="absolute left-4 top-4 z-10 inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground sm:left-5 sm:top-5"
      >
        <RiArrowLeftLine className="size-3.5" />
        {labels.back}
      </Link>

      <div className="absolute bottom-4 left-4 z-10 flex min-w-0 max-w-[calc(100%-2rem)] items-center gap-3 sm:bottom-5 sm:left-5">
        <VisitorAvatar seed={session.visitorId} className="size-12" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
            {labels.anonymous}
          </h1>
          <p className="mt-1 truncate font-mono text-[11px] text-foreground/70">
            {labels.sessionId}: {session.sessionId}
          </p>
        </div>
      </div>
    </div>
  );
}

function MetaPanel({
  locale,
  messages,
  labels,
  session,
  visitorHref,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: Labels;
  session: JourneySession;
  visitorHref: string;
}) {
  return (
    <Card className="py-0">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid min-w-0 gap-3 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] uppercase tracking-[0.14em]">
                {labels.location}
              </p>
              <div className="min-w-0 text-foreground">
                <SessionGeoBreadcrumb
                  locale={locale}
                  messages={messages}
                  session={session}
                />
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] uppercase tracking-[0.14em]">
                {labels.client}
              </p>
              <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                <BrowserMeta
                  browser={session.browser}
                  version={session.browserVersion}
                  unknownLabel={messages.common.unknown}
                />
                <OsMeta
                  os={session.os}
                  version={session.osVersion}
                  unknownLabel={messages.common.unknown}
                />
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] uppercase tracking-[0.14em]">
                {labels.device}
              </p>
              <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                <DeviceMeta
                  deviceType={session.deviceType}
                  locale={locale}
                  unknownLabel={messages.common.unknown}
                />
                <span className="font-mono text-[11px] text-foreground">
                  {formatScreen(session.screenWidth, session.screenHeight)}
                </span>
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] uppercase tracking-[0.14em]">
                {labels.referrerName}
              </p>
              <ReferrerMeta
                referrerHost={session.referrerHost}
                referrerUrl={session.referrerUrl}
                directLabel={messages.overview.direct}
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <CopyButton
              value={session.sessionId}
              label={labels.copySessionId}
              copiedLabel={labels.copied}
            />
            <CopyButton
              value={session.visitorId}
              label={labels.copyVisitorId}
              copiedLabel={labels.copied}
            />
            {session.visitorId.trim() ? (
              <Button variant="default" size="sm" asChild>
                <Link href={visitorHref}>
                  <RiUserLine data-icon="inline-start" />
                  {labels.viewVisitor}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RouteEndpoint({
  label,
  pathname,
  pagesPath,
}: {
  label: string;
  pathname: string;
  pagesPath: string;
}) {
  const displayPath = formatPath(pathname);
  return (
    <div className="min-w-0 border border-border/70 bg-muted/20 p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <Link
        href={buildPageDetailHref(pagesPath, pathname || "/")}
        className="mt-2 block truncate font-mono text-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring/60"
      >
        {displayPath}
      </Link>
    </div>
  );
}

function RouteSummaryCard({
  labels,
  session,
  pagesPath,
}: {
  labels: Labels;
  session: JourneySession;
  pagesPath: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.route}</CardTitle>
        <CardDescription>{labels.routeSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <RouteEndpoint
            label={labels.entryPath}
            pathname={session.entryPath}
            pagesPath={pagesPath}
          />
          <div className="hidden justify-center text-muted-foreground md:flex">
            <RiArrowRightLine className="size-4" />
          </div>
          <RouteEndpoint
            label={labels.exitPath}
            pathname={session.exitPath}
            pagesPath={pagesPath}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewTab({
  locale,
  labels,
  session,
  detail,
  pagesPath,
}: {
  locale: Locale;
  labels: Labels;
  session: JourneySession;
  detail: SessionDetail;
  pagesPath: string;
}) {
  const pageEvents = detail.events.filter(
    (event) => event.kind === "pageview",
  ).length;
  const customEvents = detail.events.filter(
    (event) => event.kind === "custom",
  ).length;
  const firstEvent = detail.events.reduce<JourneyEvent | null>(
    (earliest, event) =>
      !earliest || event.occurredAt < earliest.occurredAt ? event : earliest,
    null,
  );
  const lastEvent = detail.events.reduce<JourneyEvent | null>(
    (latest, event) =>
      !latest || event.occurredAt > latest.occurredAt ? event : latest,
    null,
  );

  return (
    <div className="space-y-6">
      <div className="grid overflow-hidden sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricTile
          label={labels.duration}
          value={formatDuration(locale, session.durationMs)}
        />
        <MetricTile
          label={labels.screenViews}
          value={numberFormat(locale, session.views)}
        />
        <MetricTile
          label={labels.events}
          value={numberFormat(locale, session.events)}
        />
        <MetricTile
          label={labels.uniquePages}
          value={numberFormat(locale, detail.visitedPages.length)}
        />
        <MetricTile
          label={labels.pageEvents}
          value={numberFormat(locale, pageEvents)}
        />
        <MetricTile
          label={labels.customEvents}
          value={numberFormat(locale, customEvents)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <RouteSummaryCard
          labels={labels}
          session={session}
          pagesPath={pagesPath}
        />
        <Card>
          <CardHeader>
            <CardTitle>{labels.identityTiming}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between gap-4">
              <span>{labels.createdAt}</span>
              <span className="font-mono text-foreground">
                {formatShortDateTime(locale, session.startedAt)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span>{labels.endedAt}</span>
              <span className="font-mono text-foreground">
                {formatShortDateTime(locale, session.endedAt)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span>{labels.firstEvent}</span>
              <span className="font-mono text-foreground">
                {firstEvent
                  ? formatShortDateTime(locale, firstEvent.occurredAt)
                  : "--"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span>{labels.lastEvent}</span>
              <span className="font-mono text-foreground">
                {lastEvent
                  ? formatShortDateTime(locale, lastEvent.occurredAt)
                  : "--"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{labels.visitedPages}</CardTitle>
          </CardHeader>
          <CardContent>
            <PageMetricRows
              locale={locale}
              labels={labels}
              pages={detail.visitedPages}
              total={session.views}
              pagesPath={pagesPath}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{labels.eventDistribution}</CardTitle>
          </CardHeader>
          <CardContent>
            <EventDistributionRows
              locale={locale}
              labels={labels}
              events={detail.eventDistribution}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TimelineEventButton({
  locale,
  messages,
  labels,
  event,
  deltaMs,
  onSelect,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: Labels;
  event: JourneyEvent;
  deltaMs: number | null;
  onSelect: (event: JourneyEvent) => void;
}) {
  return (
    <button
      type="button"
      className="group grid w-full grid-cols-[5.75rem_minmax(0,1fr)] gap-3 border-t border-border/70 px-4 py-3 text-left outline-none first:border-t-0 hover:bg-muted/30 focus-visible:ring-1 focus-visible:ring-ring/60 sm:grid-cols-[8rem_minmax(0,1fr)]"
      onClick={() => onSelect(event)}
    >
      <div className="pt-1 text-right font-mono text-[11px] text-muted-foreground">
        {formatShortDateTime(locale, event.occurredAt)}
      </div>
      <div className="flex min-w-0 gap-3">
        <EventIcon event={event} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-medium text-foreground">
              {eventTitle(labels, event)}
            </p>
            <Badge variant="outline">{eventKindLabel(labels, event)}</Badge>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {eventSubtitle(event, messages.common.unknown)}
          </p>
          {deltaMs !== null && deltaMs > 0 ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              {labels.sincePrevious}: {formatDuration(locale, deltaMs)}
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function JourneyTab({
  locale,
  messages,
  labels,
  events,
  onSelect,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: Labels;
  events: JourneyEvent[];
  onSelect: (event: JourneyEvent) => void;
}) {
  const chronologicalEvents = useMemo(
    () =>
      [...events].sort(
        (left, right) =>
          left.occurredAt - right.occurredAt || left.id.localeCompare(right.id),
      ),
    [events],
  );

  return (
    <Card className="py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>{labels.timelineTitle}</CardTitle>
        <CardDescription>{labels.timelineSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {chronologicalEvents.length === 0 ? (
          <div className="px-4 py-4">
            <EmptyState>{labels.emptyEvents}</EmptyState>
          </div>
        ) : (
          chronologicalEvents.map((event, index) => (
            <TimelineEventButton
              key={event.id}
              locale={locale}
              messages={messages}
              labels={labels}
              event={event}
              deltaMs={
                index > 0
                  ? event.occurredAt - chronologicalEvents[index - 1].occurredAt
                  : null
              }
              onSelect={onSelect}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function EventListTab({
  locale,
  messages,
  labels,
  events,
  onSelect,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: Labels;
  events: JourneyEvent[];
  onSelect: (event: JourneyEvent) => void;
}) {
  return (
    <Card className="py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>{labels.allEventsTitle}</CardTitle>
        <CardDescription>{labels.allEventsSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {events.length === 0 ? (
          <div className="px-4 py-4">
            <EmptyState>{labels.emptyEvents}</EmptyState>
          </div>
        ) : (
          events.map((event) => (
            <button
              key={event.id}
              type="button"
              className="flex w-full items-center gap-3 border-t border-border/70 px-4 py-3 text-left outline-none first:border-t-0 hover:bg-muted/30 focus-visible:ring-1 focus-visible:ring-ring/60"
              onClick={() => onSelect(event)}
            >
              <EventIcon event={event} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {eventTitle(labels, event)}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {eventSubtitle(event, messages.common.unknown)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-[11px] text-muted-foreground">
                  {formatShortDateTime(locale, event.occurredAt)}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {shortId(event.visitId)}
                </p>
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function PropertiesTab({
  locale,
  messages,
  labels,
  session,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: Labels;
  session: JourneySession;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-foreground">
          {labels.propertiesTitle}
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {labels.propertiesSubtitle}
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <DetailSection title={labels.identityTiming}>
          <DetailRow
            label={labels.sessionId}
            value={<DetailValue mono>{session.sessionId}</DetailValue>}
          />
          <DetailRow
            label={labels.visitorId}
            value={<DetailValue mono>{session.visitorId}</DetailValue>}
          />
          <DetailRow
            label={labels.createdAt}
            value={
              <DetailValue mono>
                {formatShortDateTime(locale, session.startedAt)}
              </DetailValue>
            }
          />
          <DetailRow
            label={labels.endedAt}
            value={
              <DetailValue mono>
                {formatShortDateTime(locale, session.endedAt)}
              </DetailValue>
            }
          />
          <DetailRow
            label={labels.duration}
            value={
              <DetailValue mono>
                {formatDuration(locale, session.durationMs)}
              </DetailValue>
            }
          />
        </DetailSection>

        <DetailSection title={labels.attribution}>
          <DetailRow
            label={labels.entryPath}
            value={
              <DetailValue mono>{formatPath(session.entryPath)}</DetailValue>
            }
          />
          <DetailRow
            label={labels.exitPath}
            value={
              <DetailValue mono>{formatPath(session.exitPath)}</DetailValue>
            }
          />
          <DetailRow
            label={labels.referrerName}
            value={
              <ReferrerMeta
                referrerHost={session.referrerHost}
                referrerUrl={session.referrerUrl}
                directLabel={messages.overview.direct}
                className="justify-end"
              />
            }
          />
          <DetailRow
            label={labels.referrerUrl}
            value={
              <DetailValue mono>
                {session.referrerUrl || messages.overview.direct}
              </DetailValue>
            }
          />
        </DetailSection>

        <DetailSection title={labels.client}>
          <DetailRow
            label={labels.browser}
            value={
              <BrowserMeta
                browser={session.browser}
                version={session.browserVersion}
                unknownLabel={messages.common.unknown}
                className="justify-end"
              />
            }
          />
          <DetailRow
            label={labels.os}
            value={
              <OsMeta
                os={session.os}
                version={session.osVersion}
                unknownLabel={messages.common.unknown}
                className="justify-end"
              />
            }
          />
          <DetailRow
            label={labels.device}
            value={
              <DeviceMeta
                deviceType={session.deviceType}
                locale={locale}
                unknownLabel={messages.common.unknown}
                className="justify-end"
              />
            }
          />
          <DetailRow
            label={labels.screen}
            value={
              <DetailValue mono>
                {formatScreen(session.screenWidth, session.screenHeight)}
              </DetailValue>
            }
          />
        </DetailSection>

        <DetailSection title={labels.location}>
          <DetailRow
            label={labels.location}
            value={
              <div className="flex min-w-0 justify-end text-foreground">
                <SessionGeoBreadcrumb
                  locale={locale}
                  messages={messages}
                  session={session}
                />
              </div>
            }
          />
          <DetailRow
            label={labels.country}
            value={
              <DetailValue>
                {session.country || messages.common.unknown}
              </DetailValue>
            }
          />
          <DetailRow
            label={labels.region}
            value={
              <DetailValue>
                {session.region || messages.common.unknown}
              </DetailValue>
            }
          />
          <DetailRow
            label={labels.city}
            value={
              <DetailValue>
                {session.city || messages.common.unknown}
              </DetailValue>
            }
          />
        </DetailSection>
      </div>
    </div>
  );
}

function EventDetailsDialog({
  locale,
  messages,
  labels,
  event,
  open,
  onOpenChange,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: Labels;
  event: JourneyEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!event) return null;

  const detailRows = [
    {
      label: labels.eventId,
      value: (
        <DetailValue mono>{event.id || messages.common.unknown}</DetailValue>
      ),
    },
    {
      label: labels.eventKind,
      value: <DetailValue>{eventKindLabel(labels, event)}</DetailValue>,
    },
    {
      label: labels.eventType,
      value: (
        <DetailValue mono>
          {event.eventType || messages.common.unknown}
        </DetailValue>
      ),
    },
    {
      label: labels.occurredAt,
      value: (
        <DetailValue mono>
          {formatShortDateTime(locale, event.occurredAt)}
        </DetailValue>
      ),
    },
    {
      label: labels.visitorId,
      value: (
        <DetailValue mono>
          {event.visitorId || messages.common.unknown}
        </DetailValue>
      ),
    },
    {
      label: labels.sessionId,
      value: (
        <DetailValue mono>
          {event.sessionId || messages.common.unknown}
        </DetailValue>
      ),
    },
    {
      label: labels.visitId,
      value: (
        <DetailValue mono>
          {event.visitId || messages.common.unknown}
        </DetailValue>
      ),
    },
    {
      label: labels.title,
      value: (
        <DetailValue>{event.title || messages.common.unknown}</DetailValue>
      ),
    },
    {
      label: labels.path,
      value: <DetailValue mono>{formatPath(event.pathname)}</DetailValue>,
    },
    {
      label: labels.hostname,
      value: (
        <DetailValue mono>
          {event.hostname || messages.common.unknown}
        </DetailValue>
      ),
    },
    {
      label: labels.referrerName,
      value: (
        <ReferrerMeta
          referrerHost={event.referrerHost}
          referrerUrl={event.referrerUrl}
          directLabel={messages.overview.direct}
          className="justify-end"
        />
      ),
    },
    {
      label: labels.referrerUrl,
      value: (
        <DetailValue mono>
          {event.referrerUrl || messages.overview.direct}
        </DetailValue>
      ),
    },
    {
      label: labels.browser,
      value: (
        <BrowserMeta
          browser={event.browser}
          version={event.browserVersion}
          unknownLabel={messages.common.unknown}
          className="justify-end"
        />
      ),
    },
    {
      label: labels.os,
      value: (
        <OsMeta
          os={event.os}
          version={event.osVersion}
          unknownLabel={messages.common.unknown}
          className="justify-end"
        />
      ),
    },
    {
      label: labels.device,
      value: (
        <DeviceMeta
          deviceType={event.deviceType}
          locale={locale}
          unknownLabel={messages.common.unknown}
          className="justify-end"
        />
      ),
    },
    {
      label: labels.screen,
      value: (
        <DetailValue mono>
          {formatScreen(event.screenWidth, event.screenHeight)}
        </DetailValue>
      ),
    },
    {
      label: labels.location,
      value: (
        <LocationMeta
          locale={locale}
          messages={messages}
          country={event.country}
          region={event.region}
          city={event.city}
          className="justify-end"
        />
      ),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader className="border-b px-4 py-4 sm:px-5">
          <DialogTitle>{labels.eventDetails}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[min(78vh,42rem)] overflow-y-auto p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3 border border-border/70 bg-muted/20 p-3">
            <EventIcon event={event} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {eventTitle(labels, event)}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {eventSubtitle(event, messages.common.unknown)}
              </p>
            </div>
            <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {formatShortDateTime(locale, event.occurredAt)}
            </p>
          </div>
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">
              {labels.eventInformation}
            </h3>
            <div className="divide-y divide-border/70 ring-1 ring-foreground/10">
              {detailRows.map((row) => (
                <DetailRow
                  key={row.label}
                  label={row.label}
                  value={row.value}
                />
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailContent({
  locale,
  messages,
  labels,
  detail,
  pathname,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: Labels;
  detail: SessionDetail;
  pathname: string;
}) {
  const [selectedEvent, setSelectedEvent] = useState<JourneyEvent | null>(null);
  const session = detail.session;
  const sessionsPath = pathname.replace(/\/detail$/, "");
  const siteBasePath = sessionsPath.replace(/\/sessions$/, "");
  const pagesPath = `${siteBasePath}/pages`;
  const visitorHref = `${siteBasePath}/visitors/detail?visitorId=${encodeURIComponent(
    session.visitorId,
  )}`;

  return (
    <div className="pb-6">
      <SessionMapHero
        labels={labels}
        session={session}
        locationPoints={detail.locationPoints}
        backHref={sessionsPath}
      />

      <div className="mx-auto mt-6 w-full max-w-[1400px] space-y-6 px-4 md:px-6">
        <MetaPanel
          locale={locale}
          messages={messages}
          labels={labels}
          session={session}
          visitorHref={visitorHref}
        />

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">
            {labels.overview}
          </h2>
          <OverviewTab
            locale={locale}
            labels={labels}
            session={session}
            detail={detail}
            pagesPath={pagesPath}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.85fr)]">
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">
              {labels.journey}
            </h2>
            <JourneyTab
              locale={locale}
              messages={messages}
              labels={labels}
              events={detail.events}
              onSelect={setSelectedEvent}
            />
          </div>
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">
              {labels.eventsTab}
            </h2>
            <EventListTab
              locale={locale}
              messages={messages}
              labels={labels}
              events={detail.events}
              onSelect={setSelectedEvent}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">
            {labels.properties}
          </h2>
          <PropertiesTab
            locale={locale}
            messages={messages}
            labels={labels}
            session={session}
          />
        </section>
      </div>

      <EventDetailsDialog
        locale={locale}
        messages={messages}
        labels={labels}
        event={selectedEvent}
        open={selectedEvent !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      />
    </div>
  );
}

export function SessionDetailClientPage({
  locale,
  messages,
  siteId,
  pathname,
}: SessionDetailClientPageProps) {
  const labels = copy(locale);
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId")?.trim() || "";
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [error, setError] = useState(false);
  const requestKey = useMemo(
    () => [siteId, sessionId].join(":"),
    [sessionId, siteId],
  );

  useEffect(() => {
    if (!sessionId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(false);
    fetchSessionDetail(siteId, sessionId)
      .then((payload) => {
        if (!active) return;
        setDetail(payload.data);
      })
      .catch(() => {
        if (!active) return;
        setDetail(null);
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestKey]);

  if (!sessionId) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          {labels.missing}
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          {messages.common.loading}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          {labels.loadError}
        </CardContent>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          {labels.notFound}
        </CardContent>
      </Card>
    );
  }

  return (
    <DetailContent
      locale={locale}
      messages={messages}
      labels={labels}
      detail={detail}
      pathname={pathname}
    />
  );
}
