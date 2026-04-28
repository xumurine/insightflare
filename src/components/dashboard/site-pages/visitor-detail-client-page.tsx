"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  RiArrowLeftLine,
  RiCalendarEventLine,
  RiPulseLine,
} from "@remixicon/react";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";
import {
  BrowserMeta,
  DeviceMeta,
  formatDuration,
  formatPath,
  formatRelativeTime,
  formatScreen,
  formatShortDateTime,
  LocationMeta,
  OsMeta,
  ReferrerMeta,
  VisitorAvatar,
} from "@/components/dashboard/journey-display";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  durationFormat,
  numberFormat,
  percentFormat,
} from "@/lib/dashboard/format";
import { fetchVisitorDetail } from "@/lib/dashboard/client-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import type {
  JourneyEvent,
  JourneySession,
  VisitorActivityDay,
  VisitorDetailData,
} from "@/lib/edge-client";

interface VisitorDetailClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

type VisitorDetail = NonNullable<VisitorDetailData["data"]>;

function copy(locale: Locale) {
  return locale === "zh"
    ? {
        anonymous: "匿名访客",
        overview: "总览",
        events: "事件",
        sessions: "会话",
        back: "返回访客",
        missing: "缺少 visitorId。",
        notFound: "没有找到这个访客。",
        loadError: "无法加载访客详情。",
        totalEvents: "事件总数",
        avgEventsPerSession: "平均事件/会话",
        p90Duration: "P90 会话时长",
        firstSeen: "首次出现",
        lastSeen: "最近出现",
        daysActive: "活跃天数",
        conversionEvents: "转化事件",
        avgTimeBetweenSessions: "平均会话间隔",
        profileInformation: "访客信息",
        profile: "Profile",
        properties: "Properties",
        activity: "Activity",
        latestEvents: "最新事件",
        visitedPages: "访问页面",
        eventDistribution: "事件分布",
        screen: "屏幕",
        eventType: "事件类型",
        occurredAt: "时间",
        session: "会话",
      }
    : {
        anonymous: "Anonymous",
        overview: "Overview",
        events: "Events",
        sessions: "Sessions",
        back: "Back to visitors",
        missing: "Missing visitorId.",
        notFound: "Visitor not found.",
        loadError: "Unable to load visitor detail.",
        totalEvents: "Total Events",
        avgEventsPerSession: "Avg Events/Session",
        p90Duration: "Session Duration (P90)",
        firstSeen: "First seen",
        lastSeen: "Last seen",
        daysActive: "Days Active",
        conversionEvents: "Conversion Events",
        avgTimeBetweenSessions: "Avg Time Between Sessions",
        profileInformation: "Profile Information",
        profile: "Profile",
        properties: "Properties",
        activity: "Activity",
        latestEvents: "Latest Events",
        visitedPages: "Visited pages",
        eventDistribution: "Event distribution",
        screen: "Screen",
        eventType: "Event Type",
        occurredAt: "Time",
        session: "Session",
      };
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-border/70 p-4 ring-1 ring-foreground/10">
      <p className="text-[11px] leading-snug text-muted-foreground">{label}</p>
      <p className="mt-2 break-words font-mono text-xl font-semibold leading-tight [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid min-h-9 grid-cols-[10rem_1fr] items-center gap-4 border-t border-border/70 px-4 py-2 first:border-t-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="min-w-0 text-right font-mono text-[11px] text-foreground">
        {value}
      </div>
    </div>
  );
}

function ActivityGrid({
  activity,
  locale,
}: {
  activity: VisitorActivityDay[];
  locale: Locale;
}) {
  const days = useMemo(() => {
    const byDate = new Map(activity.map((item) => [item.date, item.count]));
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 83);
    const next: Array<{ date: string; count: number }> = [];
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      next.push({ date, count: byDate.get(date) ?? 0 });
    }
    return next;
  }, [activity]);
  const max = Math.max(1, ...days.map((day) => day.count));

  return (
    <div className="grid grid-cols-12 gap-1.5">
      {days.map((day) => {
        const intensity = day.count / max;
        return (
          <div
            key={day.date}
            title={`${day.date}: ${numberFormat(locale, day.count)}`}
            className="aspect-square bg-muted"
            style={{
              opacity: day.count > 0 ? 0.35 + intensity * 0.65 : 0.42,
              backgroundColor: day.count > 0 ? "rgb(16 185 129)" : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

function EventIcon({ event }: { event: JourneyEvent }) {
  const isCustom = event.kind === "custom";
  return (
    <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-sm ${isCustom ? "bg-sky-500/15 text-sky-500" : "bg-emerald-500/15 text-emerald-500"}`}>
      {isCustom ? <RiPulseLine className="size-4" /> : <RiCalendarEventLine className="size-4" />}
    </span>
  );
}

function EventList({
  locale,
  labels,
  events,
  compact = false,
}: {
  locale: Locale;
  labels: ReturnType<typeof copy>;
  events: JourneyEvent[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-center gap-3 border border-border/70 bg-card px-3 py-2"
        >
          <EventIcon event={event} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {event.kind === "pageview" ? formatPath(event.pathname) : event.eventType}
            </p>
            {!compact ? (
              <p className="truncate text-[11px] text-muted-foreground">
                {event.title || event.hostname || event.sessionId}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-[11px] text-muted-foreground">
              {formatShortDateTime(locale, event.occurredAt)}
            </p>
            {!compact ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                {labels.session}: {event.sessionId.slice(0, 8)}...
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionsTable({
  locale,
  messages,
  sessions,
  basePath,
}: {
  locale: Locale;
  messages: AppMessages;
  sessions: JourneySession[];
  basePath: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{messages.common.startedAt}</TableHead>
          <TableHead>{messages.realtime.sessionId}</TableHead>
          <TableHead>{messages.common.entryPage}</TableHead>
          <TableHead>{messages.common.exitPage}</TableHead>
          <TableHead>{messages.common.avgDuration}</TableHead>
          <TableHead className="text-right">{messages.common.views}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => (
          <TableRow key={session.sessionId}>
            <TableCell className="font-mono text-muted-foreground">
              {formatShortDateTime(locale, session.startedAt)}
            </TableCell>
            <TableCell>
              <Link
                href={`${basePath}/sessions/detail?sessionId=${encodeURIComponent(session.sessionId)}`}
                className="font-mono font-medium"
              >
                {session.sessionId.slice(0, 12)}...
              </Link>
            </TableCell>
            <TableCell className="max-w-72 truncate font-mono">{formatPath(session.entryPath)}</TableCell>
            <TableCell className="max-w-72 truncate font-mono">{formatPath(session.exitPath)}</TableCell>
            <TableCell className="font-mono">{formatDuration(locale, session.durationMs)}</TableCell>
            <TableCell className="text-right font-mono">{numberFormat(locale, session.views)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
  labels: ReturnType<typeof copy>;
  detail: VisitorDetail;
  pathname: string;
}) {
  const { visitor, metrics } = detail;
  const visitorListPath = pathname.replace(/\/detail$/, "");
  const siteBasePath = visitorListPath.replace(/\/visitors$/, "");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Link
            href={visitorListPath}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RiArrowLeftLine className="size-3.5" />
            {labels.back}
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <VisitorAvatar seed={visitor.visitorId} className="size-10" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {labels.anonymous}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <LocationMeta
                  locale={locale}
                  messages={messages}
                  country={visitor.country || ""}
                  region={visitor.region}
                  city={visitor.city}
                />
                <DeviceMeta
                  deviceType={visitor.deviceType || ""}
                  locale={locale}
                  unknownLabel={messages.common.unknown}
                />
                <OsMeta os={visitor.os || ""} version={visitor.osVersion} unknownLabel={messages.common.unknown} />
                <BrowserMeta browser={visitor.browser || ""} version={visitor.browserVersion} unknownLabel={messages.common.unknown} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList variant="line">
          <TabsTrigger value="overview">{labels.overview}</TabsTrigger>
          <TabsTrigger value="events">{labels.events}</TabsTrigger>
          <TabsTrigger value="sessions">{labels.sessions}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid overflow-hidden md:grid-cols-3 xl:grid-cols-6">
            <MetricTile label={labels.totalEvents} value={numberFormat(locale, metrics.totalEvents)} />
            <MetricTile label={labels.sessions} value={numberFormat(locale, metrics.sessions)} />
            <MetricTile label={messages.common.views} value={numberFormat(locale, metrics.views)} />
            <MetricTile label={labels.avgEventsPerSession} value={metrics.avgEventsPerSession.toFixed(1)} />
            <MetricTile label={messages.common.bounceRate} value={percentFormat(locale, metrics.bounceRate)} />
            <MetricTile label={messages.common.avgDuration} value={durationFormat(locale, metrics.avgDurationMs)} />
            <MetricTile label={labels.p90Duration} value={durationFormat(locale, metrics.p90DurationMs)} />
            <MetricTile label={labels.firstSeen} value={formatRelativeTime(locale, metrics.firstSeenAt, Date.now())} />
            <MetricTile label={labels.lastSeen} value={formatRelativeTime(locale, metrics.lastSeenAt, Date.now())} />
            <MetricTile label={labels.daysActive} value={numberFormat(locale, metrics.daysActive)} />
            <MetricTile label={labels.conversionEvents} value={numberFormat(locale, metrics.conversionEvents)} />
            <MetricTile label={labels.avgTimeBetweenSessions} value={durationFormat(locale, metrics.avgTimeBetweenSessionsMs)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{labels.profileInformation}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <div className="grid md:grid-cols-2 xl:grid-cols-3">
                <DetailRow label={messages.common.id} value={visitor.visitorId} />
                <DetailRow label={messages.common.country} value={visitor.country || messages.common.unknown} />
                <DetailRow label={messages.common.region} value={visitor.region || messages.common.unknown} />
                <DetailRow label={messages.common.city} value={visitor.city || messages.common.unknown} />
                <DetailRow label={messages.common.browser} value={visitor.browser || messages.common.unknown} />
                <DetailRow label={messages.common.operatingSystem} value={visitor.osVersion || visitor.os || messages.common.unknown} />
                <DetailRow label={messages.common.deviceType} value={visitor.deviceType || messages.common.unknown} />
                <DetailRow label={labels.screen} value={formatScreen(visitor.screenWidth, visitor.screenHeight)} />
                <DetailRow
                  label={messages.common.referrer}
                  value={<ReferrerMeta referrerHost={visitor.referrerHost || ""} referrerUrl={visitor.referrerUrl} directLabel={messages.overview.direct} className="justify-end" />}
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>{labels.activity}</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityGrid activity={detail.activity} locale={locale} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{labels.latestEvents}</CardTitle>
              </CardHeader>
              <CardContent>
                <EventList locale={locale} labels={labels} events={detail.events.slice(0, 8)} compact />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{labels.visitedPages}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {detail.visitedPages.map((page) => (
                  <div key={page.pathname} className="flex items-center justify-between gap-4 bg-muted/35 px-3 py-2">
                    <span className="min-w-0 truncate font-mono">{formatPath(page.pathname)}</span>
                    <span className="font-mono">{numberFormat(locale, page.views)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{labels.eventDistribution}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {detail.eventDistribution.map((event) => (
                  <div key={event.eventType} className="flex items-center justify-between gap-4 bg-muted/35 px-3 py-2">
                    <span className="min-w-0 truncate">{event.eventType}</span>
                    <span className="font-mono">{numberFormat(locale, event.count)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardContent className="py-4">
              <EventList locale={locale} labels={labels} events={detail.events} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card className="py-0">
            <CardContent className="px-0">
              <SessionsTable
                locale={locale}
                messages={messages}
                sessions={detail.sessions}
                basePath={siteBasePath}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function VisitorDetailClientPage({
  locale,
  messages,
  siteId,
  pathname,
}: VisitorDetailClientPageProps) {
  const labels = copy(locale);
  const searchParams = useSearchParams();
  const visitorId = searchParams.get("visitorId")?.trim() || "";
  const { filters, window } = useDashboardQuery() as {
    filters: DashboardFilters;
    window: TimeWindow;
  };
  const [detail, setDetail] = useState<VisitorDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(visitorId));
  const [error, setError] = useState(false);
  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const requestKey = useMemo(
    () => [siteId, visitorId, window.from, window.to, filtersKey].join(":"),
    [filtersKey, siteId, visitorId, window.from, window.to],
  );

  useEffect(() => {
    if (!visitorId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(false);
    fetchVisitorDetail(siteId, visitorId, window, filters)
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

  if (!visitorId) {
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
