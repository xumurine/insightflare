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
  RiCalendarEventLine,
  RiPulseLine,
  RiTimeLine,
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
        active: "进行中",
        inactive: "已结束",
        status: "状态",
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
        yes: "是",
        no: "否",
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
        emptyEvents: "没有事件记录。",
        sincePrevious: "距上个事件",
      }
    : {
        titlePrefix: "Session",
        anonymous: "Anonymous",
        back: "Back to sessions",
        missing: "Missing sessionId.",
        notFound: "Session not found.",
        loadError: "Unable to load session detail.",
        active: "Active",
        inactive: "Ended",
        status: "Status",
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
        yes: "Yes",
        no: "No",
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
        emptyEvents: "No events recorded.",
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

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-24 items-center justify-center border border-dashed border-border px-4 py-6 text-center text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}

function SummaryGridItem({
  label,
  value,
  mono = false,
  prominent = false,
  className,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  prominent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 bg-card p-4", className)}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          "mt-2 min-w-0 text-foreground [overflow-wrap:anywhere]",
          mono && "font-mono",
          prominent
            ? "text-xl font-semibold leading-tight"
            : "text-xs leading-relaxed",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SummaryText({
  children,
  mono = false,
}: {
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-2 text-foreground",
        mono && "font-mono",
      )}
    >
      <span className="min-w-0 break-all">{children}</span>
    </span>
  );
}

function SummaryPathLink({
  pathname,
  pagesPath,
}: {
  pathname: string;
  pagesPath: string;
}) {
  return (
    <Link
      href={buildPageDetailHref(pagesPath, pathname || "/")}
      className="block min-w-0 truncate font-mono text-xs text-foreground outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring/60"
    >
      {formatPath(pathname)}
    </Link>
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
  visitorHref,
}: {
  labels: Labels;
  session: JourneySession;
  locationPoints: SessionDetail["locationPoints"] | undefined;
  backHref: string;
  visitorHref: string;
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

      {session.visitorId.trim() ? (
        <Link
          href={visitorHref}
          className="absolute bottom-4 left-4 z-10 flex min-w-0 max-w-[calc(100%-2rem)] items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 sm:bottom-5 sm:left-5"
        >
          <VisitorAvatar seed={session.visitorId} className="size-12" />
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground">
            {labels.anonymous}
          </h1>
        </Link>
      ) : (
        <div className="absolute bottom-4 left-4 z-10 flex min-w-0 max-w-[calc(100%-2rem)] items-center gap-3 sm:bottom-5 sm:left-5">
          <VisitorAvatar seed={session.visitorId} className="size-12" />
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground">
            {labels.anonymous}
          </h1>
        </div>
      )}
    </div>
  );
}

function MetaPanel({
  locale,
  messages,
  labels,
  detail,
  pagesPath,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: Labels;
  detail: SessionDetail;
  pagesPath: string;
}) {
  const session = detail.session;
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
    <Card className="py-0">
      <CardContent className="p-0">
        <div className="grid gap-px overflow-hidden bg-border/70 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <SummaryGridItem
            label={labels.sessionId}
            mono
            value={<SummaryText mono>{session.sessionId}</SummaryText>}
          />
          <SummaryGridItem
            label={labels.visitorId}
            mono
            value={
              <SummaryText mono>
                {session.visitorId || messages.common.unknown}
              </SummaryText>
            }
          />
          <SummaryGridItem
            label={labels.duration}
            prominent
            mono
            value={formatDuration(locale, session.durationMs)}
          />
          <SummaryGridItem
            label={labels.screenViews}
            prominent
            mono
            value={numberFormat(locale, session.views)}
          />
          <SummaryGridItem
            label={labels.events}
            prominent
            mono
            value={numberFormat(locale, session.events)}
          />
          <SummaryGridItem
            label={labels.uniquePages}
            prominent
            mono
            value={numberFormat(locale, detail.visitedPages.length)}
          />
          <SummaryGridItem
            label={labels.pageEvents}
            prominent
            mono
            value={numberFormat(locale, pageEvents)}
          />
          <SummaryGridItem
            label={labels.customEvents}
            prominent
            mono
            value={numberFormat(locale, customEvents)}
          />
          <SummaryGridItem
            label={labels.createdAt}
            mono
            value={formatShortDateTime(locale, session.startedAt)}
          />
          <SummaryGridItem
            label={labels.endedAt}
            mono
            value={formatShortDateTime(locale, session.endedAt)}
          />
          <SummaryGridItem
            label={labels.firstEvent}
            mono
            value={
              firstEvent
                ? formatShortDateTime(locale, firstEvent.occurredAt)
                : "--"
            }
          />
          <SummaryGridItem
            label={labels.lastEvent}
            mono
            value={
              lastEvent
                ? formatShortDateTime(locale, lastEvent.occurredAt)
                : "--"
            }
          />
          <SummaryGridItem
            label={labels.entryPath}
            className="sm:col-span-2"
            value={
              <SummaryPathLink
                pathname={session.entryPath}
                pagesPath={pagesPath}
              />
            }
          />
          <SummaryGridItem
            label={labels.exitPath}
            className="sm:col-span-2"
            value={
              <SummaryPathLink
                pathname={session.exitPath}
                pagesPath={pagesPath}
              />
            }
          />
          <SummaryGridItem
            label={labels.referrerName}
            value={
              <ReferrerMeta
                referrerHost={session.referrerHost}
                referrerUrl={session.referrerUrl}
                directLabel={messages.overview.direct}
              />
            }
          />
          <SummaryGridItem
            label={labels.referrerUrl}
            mono
            className="sm:col-span-2 lg:col-span-1"
            value={session.referrerUrl || messages.overview.direct}
          />
          <SummaryGridItem
            label={labels.location}
            className="sm:col-span-2"
            value={
              <SessionGeoBreadcrumb
                locale={locale}
                messages={messages}
                session={session}
              />
            }
          />
          <SummaryGridItem
            label={labels.country}
            value={session.country || messages.common.unknown}
          />
          <SummaryGridItem
            label={labels.region}
            value={session.region || messages.common.unknown}
          />
          <SummaryGridItem
            label={labels.city}
            value={session.city || messages.common.unknown}
          />
          <SummaryGridItem
            label={labels.client}
            className="sm:col-span-2"
            value={
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
            }
          />
          <SummaryGridItem
            label={labels.device}
            value={
              <DeviceMeta
                deviceType={session.deviceType}
                locale={locale}
                unknownLabel={messages.common.unknown}
              />
            }
          />
          <SummaryGridItem
            label={labels.screen}
            mono
            value={formatScreen(session.screenWidth, session.screenHeight)}
          />
          <SummaryGridItem
            label={labels.bounce}
            value={session.bounce ? labels.yes : labels.no}
          />
          <SummaryGridItem
            label={labels.status}
            value={session.active ? labels.active : labels.inactive}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SessionEventCard({
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
  const handleSelect = () => onSelect(event);

  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;
        keyboardEvent.preventDefault();
        handleSelect();
      }}
      className="cursor-pointer transition-colors outline-none hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring/70"
    >
      <CardContent className="px-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 self-center">
            <VisitorAvatar
              seed={event.visitorId || event.sessionId}
              className="size-9"
            />
          </div>
          <div className="flex min-w-0 flex-1 items-stretch justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-foreground">
                  {eventTitle(labels, event)}
                </p>
                <Badge variant="outline">{eventKindLabel(labels, event)}</Badge>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
                <span className="min-w-0 truncate">
                  {eventSubtitle(event, messages.common.unknown)}
                </span>
                {event.visitId.trim() ? (
                  <span className="font-mono">{shortId(event.visitId)}</span>
                ) : null}
                {deltaMs !== null && deltaMs > 0 ? (
                  <span className="font-mono">
                    {labels.sincePrevious}: {formatDuration(locale, deltaMs)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 self-stretch">
              <div className="flex h-full min-w-[7.5rem] flex-col items-end justify-between text-right">
                <p className="font-mono text-[11px] text-foreground">
                  {formatShortDateTime(locale, event.occurredAt)}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {event.sessionId ? shortId(event.sessionId) : "--"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>{labels.timelineTitle}</CardTitle>
        <CardDescription>{labels.timelineSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {chronologicalEvents.length === 0 ? (
          <EmptyState>{labels.emptyEvents}</EmptyState>
        ) : (
          <div className="space-y-2">
            {chronologicalEvents.map((event, index) => (
              <SessionEventCard
                key={event.id}
                locale={locale}
                messages={messages}
                labels={labels}
                event={event}
                deltaMs={
                  index > 0
                    ? event.occurredAt -
                      chronologicalEvents[index - 1].occurredAt
                    : null
                }
                onSelect={onSelect}
              />
            ))}
          </div>
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
    <Card>
      <CardHeader>
        <CardTitle>{labels.allEventsTitle}</CardTitle>
        <CardDescription>{labels.allEventsSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState>{labels.emptyEvents}</EmptyState>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <SessionEventCard
                key={event.id}
                locale={locale}
                messages={messages}
                labels={labels}
                event={event}
                deltaMs={null}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
        visitorHref={visitorHref}
      />

      <div className="mx-auto mt-6 w-full max-w-[1400px] space-y-6 px-4 md:px-6">
        <MetaPanel
          locale={locale}
          messages={messages}
          labels={labels}
          detail={detail}
          pagesPath={pagesPath}
        />

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.85fr)]">
          <JourneyTab
            locale={locale}
            messages={messages}
            labels={labels}
            events={detail.events}
            onSelect={setSelectedEvent}
          />
          <EventListTab
            locale={locale}
            messages={messages}
            labels={labels}
            events={detail.events}
            onSelect={setSelectedEvent}
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
