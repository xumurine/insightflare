"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Map, { useControl } from "react-map-gl/maplibre";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  AsyncDimensionBreakdownCard,
  type AsyncDimensionBreakdownRow,
} from "@/components/dashboard/async-dimension-breakdown-card";
import {
  BrowserMeta,
  DeviceMeta,
  formatDuration,
  formatPath,
  formatScreen,
  formatShortDateTime,
  OsMeta,
  ReferrerMeta,
  VisitorAvatar,
} from "@/components/dashboard/journey-display";
import { LazyGeoCityBreadcrumbLabel } from "@/components/dashboard/lazy-geo-location-label";
import {
  OverviewPagesSection,
  type OverviewPagesSectionCardData,
} from "@/components/dashboard/site-pages/overview-client-page";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clickable } from "@/components/ui/clickable";
import {
  fetchSessionDetail,
  type OverviewTabRows,
} from "@/lib/dashboard/client-data";
import { intlLocale, numberFormat } from "@/lib/dashboard/format";
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
        screenViews: "页面浏览",
        events: "事件",
        bounce: "跳出",
        entryPath: "入口路径",
        exitPath: "退出路径",
        referrerName: "来源名称",
        os: "系统",
        browser: "浏览器",
        device: "设备",
        screen: "屏幕",
        yes: "是",
        no: "否",
        uniquePages: "唯一页面",
        firstEvent: "首个事件",
        lastEvent: "最后事件",
        sessionStarted: "会话开始",
        pageview: "访问页面",
        customEvent: "自定义事件",
        eventTitleSeparator: "：",
        visitDetailsTitle: "访问明细",
        visitDetailsSubtitle: "按发生顺序展示该会话内的页面访问和自定义事件。",
        path: "路径",
        title: "标题",
        location: "位置",
        visitorId: "访客 ID",
        sessionId: "会话 ID",
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
        screenViews: "Screen Views",
        events: "Events",
        bounce: "Bounce",
        entryPath: "Entry Path",
        exitPath: "Exit Path",
        referrerName: "Referrer Name",
        os: "OS",
        browser: "Browser",
        device: "Device",
        screen: "Screen",
        yes: "Yes",
        no: "No",
        uniquePages: "Unique Pages",
        firstEvent: "First Event",
        lastEvent: "Last Event",
        sessionStarted: "Session started",
        pageview: "Pageview",
        customEvent: "Custom event",
        eventTitleSeparator: ": ",
        visitDetailsTitle: "Visit details",
        visitDetailsSubtitle:
          "Pageviews and custom events in the order they happened.",
        path: "Path",
        title: "Title",
        location: "Location",
        visitorId: "Visitor ID",
        sessionId: "Session ID",
        referrerUrl: "Referrer URL",
        emptyEvents: "No events recorded.",
        sincePrevious: "Since previous",
      };
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

function eventDisplayTitle(labels: Labels, event: JourneyEvent): string {
  const kind = eventKindLabel(labels, event);
  const title = eventTitle(labels, event);
  if (!title || title === kind) return kind;
  return `${kind}${labels.eventTitleSeparator}${title}`;
}

function formatDetailedDateTime(locale: Locale, timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "--";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function eventSubtitle(
  locale: Locale,
  event: JourneyEvent,
  unknownLabel: string,
): string {
  if (event.kind === "session_start") {
    return formatDetailedDateTime(locale, event.occurredAt);
  }
  return event.title.trim() || event.hostname.trim() || unknownLabel;
}

function EventIcon({ event }: { event: JourneyEvent }) {
  const isCustom = event.kind === "custom";
  const isSessionStart = event.kind === "session_start";
  return (
    <span
      className={cn(
        "inline-flex size-[34px] shrink-0 self-center items-center justify-center rounded-none",
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
  const router = useRouter();
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

      <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between gap-4 sm:inset-x-5 sm:top-5">
        <Clickable
          className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground"
          enableHoverScale={false}
          tapScale={0.98}
          aria-label={labels.back}
          title={labels.back}
          onClick={() => router.push(backHref)}
        >
          <RiArrowLeftLine className="size-3.5" />
          {labels.back}
        </Clickable>
        <div className="min-w-0 truncate text-right font-mono text-[11px] text-foreground/70">
          {labels.sessionId}: {session.sessionId}
        </div>
      </div>

      {session.visitorId.trim() ? (
        <Link
          href={visitorHref}
          className="absolute bottom-4 left-4 z-10 flex min-w-0 max-w-[calc(100%-2rem)] items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 sm:bottom-5 sm:left-5"
        >
          <VisitorAvatar seed={session.visitorId} className="size-12" />
          <div className="min-w-0">
            <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground">
              {labels.anonymous}
            </h1>
            <p className="mt-1 truncate font-mono text-[11px] text-foreground/70">
              {labels.visitorId}: {session.visitorId}
            </p>
          </div>
        </Link>
      ) : (
        <div className="absolute bottom-4 left-4 z-10 flex min-w-0 max-w-[calc(100%-2rem)] items-center gap-3 sm:bottom-5 sm:left-5">
          <VisitorAvatar seed={session.visitorId} className="size-12" />
          <div className="min-w-0">
            <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground">
              {labels.anonymous}
            </h1>
            <p className="mt-1 truncate font-mono text-[11px] text-foreground/70">
              {labels.visitorId}: --
            </p>
          </div>
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
        <div className="grid grid-cols-2 gap-px overflow-hidden bg-border/70 text-xs text-muted-foreground xl:grid-cols-4">
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
            label={labels.entryPath}
            className="col-span-2"
            value={
              <SummaryPathLink
                pathname={session.entryPath}
                pagesPath={pagesPath}
              />
            }
          />
          <SummaryGridItem
            label={labels.exitPath}
            className="col-span-2"
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
            value={session.referrerUrl || messages.overview.direct}
          />
          <SummaryGridItem
            label={labels.location}
            className="col-span-2"
            value={
              <SessionGeoBreadcrumb
                locale={locale}
                messages={messages}
                session={session}
              />
            }
          />
          <SummaryGridItem
            label={labels.browser}
            value={
              <BrowserMeta
                browser={session.browser}
                version={session.browserVersion}
                unknownLabel={messages.common.unknown}
              />
            }
          />
          <SummaryGridItem
            label={labels.os}
            value={
              <OsMeta
                os={session.os}
                version={session.osVersion}
                unknownLabel={messages.common.unknown}
              />
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
}: {
  locale: Locale;
  messages: AppMessages;
  labels: Labels;
  event: JourneyEvent;
  deltaMs: number | null;
}) {
  return (
    <Card size="sm" className="py-0">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-2 py-1">
          <EventIcon event={event} />
          <div className="flex min-w-0 flex-1 items-stretch justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="min-w-0 truncate text-sm font-medium leading-5 text-foreground">
                {eventDisplayTitle(labels, event)}
              </p>
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[11px] leading-[14px] text-muted-foreground">
                <span className="min-w-0 truncate leading-[14px]">
                  {eventSubtitle(locale, event, messages.common.unknown)}
                </span>
              </div>
            </div>
            <div className="flex h-[34px] min-w-0 w-[42%] shrink-0 flex-col items-end justify-between text-right sm:w-auto sm:max-w-[24rem]">
              <p className="font-mono text-[11px] leading-[14px] text-foreground">
                {formatShortDateTime(locale, event.occurredAt)}
              </p>
              {deltaMs !== null && deltaMs > 0 ? (
                <p className="max-w-full break-words font-mono text-[10px] leading-[13px] text-muted-foreground">
                  {labels.sincePrevious}: {formatDuration(locale, deltaMs)}
                </p>
              ) : (
                <span className="h-[13px]" aria-hidden="true" />
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VisitDetailsTab({
  locale,
  messages,
  labels,
  events,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: Labels;
  events: JourneyEvent[];
}) {
  const chronologicalEvents = useMemo(
    () =>
      [...events].sort((left, right) => {
        const leftRank = left.kind === "session_start" ? 0 : 1;
        const rightRank = right.kind === "session_start" ? 0 : 1;
        return (
          leftRank - rightRank ||
          left.occurredAt - right.occurredAt ||
          left.id.localeCompare(right.id)
        );
      }),
    [events],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.visitDetailsTitle}</CardTitle>
        <CardDescription>{labels.visitDetailsSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {chronologicalEvents.length === 0 ? (
          <EmptyState>{labels.emptyEvents}</EmptyState>
        ) : (
          <div className="space-y-1.5">
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
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const SESSION_DETAIL_OVERVIEW_FILTERS = {};
const SESSION_OVERVIEW_PAGE_CARD_TABS = [
  "path",
  "title",
  "hostname",
  "entry",
  "exit",
] as const;

interface SessionOverviewRowInput {
  label: string;
  views?: number;
}

function aggregateOverviewRows(
  rows: SessionOverviewRowInput[],
  fallbackLabel: string,
): OverviewTabRows {
  const rowByLabel = new globalThis.Map<string, OverviewTabRows[number]>();

  for (const row of rows) {
    const label = row.label.trim() || fallbackLabel;
    if (!label) continue;
    const views = Math.max(1, Math.floor(Number(row.views ?? 1)));
    const existing = rowByLabel.get(label);

    if (existing) {
      existing.views += views;
      existing.sessions = Math.max(1, existing.sessions);
      existing.visitors = Math.max(1, existing.visitors);
      continue;
    }

    rowByLabel.set(label, {
      label,
      views,
      sessions: 1,
      visitors: 1,
    });
  }

  return Array.from(rowByLabel.values()).sort(
    (left, right) =>
      right.views - left.views || left.label.localeCompare(right.label),
  );
}

function buildSessionOverviewPageCardData(
  detail: SessionDetail,
  unknownLabel: string,
): OverviewPagesSectionCardData {
  const pageviewEvents = detail.events.filter(
    (event) => event.kind === "pageview",
  );
  const pathRows =
    detail.visitedPages.length > 0
      ? aggregateOverviewRows(
          detail.visitedPages.map((page) => ({
            label: page.pathname || "/",
            views: page.views,
          })),
          "/",
        )
      : aggregateOverviewRows(
          pageviewEvents.map((event) => ({ label: event.pathname || "/" })),
          "/",
        );

  return {
    page: {
      path: pathRows,
      query: [],
      title: aggregateOverviewRows(
        pageviewEvents.map((event) => ({ label: event.title })),
        unknownLabel,
      ),
      hostname: aggregateOverviewRows(
        pageviewEvents.map((event) => ({ label: event.hostname })),
        unknownLabel,
      ),
      entry: aggregateOverviewRows(
        [{ label: detail.session.entryPath || "/", views: 1 }],
        "/",
      ),
      exit: aggregateOverviewRows(
        [{ label: detail.session.exitPath || "/", views: 1 }],
        "/",
      ),
    },
    source: {
      domain: [],
      link: [],
    },
    client: {
      browser: [],
      osVersion: [],
      deviceType: [],
      language: [],
      screenSize: [],
    },
    geo: {
      country: [],
      region: [],
      city: [],
      continent: [],
      timezone: [],
      organization: [],
    },
  };
}

function resolveSessionSiteDomain(detail: SessionDetail): string {
  for (const event of detail.events) {
    const hostname = event.hostname.trim();
    if (hostname) return hostname;
  }
  return "";
}

function buildSessionEventBreakdownRows(
  events: JourneyEvent[],
  labels: Labels,
): AsyncDimensionBreakdownRow[] {
  const rowByLabel = new globalThis.Map<string, AsyncDimensionBreakdownRow>();

  for (const event of events) {
    const label =
      event.kind === "custom"
        ? event.eventType.trim() || labels.customEvent
        : eventKindLabel(labels, event);
    const existing = rowByLabel.get(label);

    if (existing) {
      existing.views += 1;
      continue;
    }

    rowByLabel.set(label, {
      key: label,
      label,
      views: 1,
      visitors: 1,
      mono: event.kind === "custom",
    });
  }

  return Array.from(rowByLabel.values()).sort(
    (left, right) =>
      right.views - left.views || left.label.localeCompare(right.label),
  );
}

function SessionDetailBottomCards({
  locale,
  messages,
  labels,
  detail,
  siteId,
  siteBasePath,
  siteDomain,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: Labels;
  detail: SessionDetail;
  siteId: string;
  siteBasePath: string;
  siteDomain: string;
}) {
  const pageCardData = useMemo(
    () => buildSessionOverviewPageCardData(detail, messages.common.unknown),
    [detail, messages.common.unknown],
  );
  const eventRows = useMemo(
    () => buildSessionEventBreakdownRows(detail.events, labels),
    [detail.events, labels],
  );
  const eventTabs = useMemo(
    () =>
      [
        {
          value: "event",
          label: labels.events,
          columnLabel: labels.events,
          primaryMetricLabel: labels.events,
        },
      ] as const,
    [labels.events],
  );
  const loadEventRows = useMemo(() => async () => eventRows, [eventRows]);

  return (
    <section className="grid items-stretch gap-6 xl:grid-cols-2">
      <div className="min-w-0 [&>section]:!grid-cols-1">
        <OverviewPagesSection
          locale={locale}
          messages={messages}
          siteId={siteId}
          siteDomain={siteDomain}
          pathname={siteBasePath}
          filters={SESSION_DETAIL_OVERVIEW_FILTERS}
          cardDataOverride={pageCardData}
          visibleCards={["page"]}
          pageCardTabs={SESSION_OVERVIEW_PAGE_CARD_TABS}
        />
      </div>

      <div className="min-w-0">
        <AsyncDimensionBreakdownCard
          locale={locale}
          messages={messages}
          tabs={eventTabs}
          loadRows={loadEventRows}
          requestKey={`session-detail-events:${detail.session.sessionId}:${locale}`}
          className="h-full"
        />
      </div>
    </section>
  );
}

function DetailContent({
  locale,
  messages,
  labels,
  detail,
  siteId,
  pathname,
}: {
  locale: Locale;
  messages: AppMessages;
  labels: Labels;
  detail: SessionDetail;
  siteId: string;
  pathname: string;
}) {
  const session = detail.session;
  const sessionsPath = pathname.replace(/\/detail$/, "");
  const siteBasePath = sessionsPath.replace(/\/sessions$/, "");
  const sessionSiteDomain = useMemo(
    () => resolveSessionSiteDomain(detail),
    [detail],
  );
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

        <section>
          <VisitDetailsTab
            locale={locale}
            messages={messages}
            labels={labels}
            events={detail.events}
          />
        </section>

        <SessionDetailBottomCards
          locale={locale}
          messages={messages}
          labels={labels}
          detail={detail}
          siteId={siteId}
          siteBasePath={siteBasePath}
          siteDomain={sessionSiteDomain}
        />
      </div>
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
      siteId={siteId}
      pathname={pathname}
    />
  );
}
