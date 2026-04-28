"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  RiArrowLeftLine,
  RiCalendarEventLine,
  RiPulseLine,
} from "@remixicon/react";
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
} from "@/components/dashboard/journey-display";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { numberFormat } from "@/lib/dashboard/format";
import { fetchSessionDetail } from "@/lib/dashboard/client-data";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import type {
  JourneyEvent,
  SessionDetailData,
} from "@/lib/edge-client";

interface SessionDetailClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

type SessionDetail = NonNullable<SessionDetailData["data"]>;

function copy(locale: Locale) {
  return locale === "zh"
    ? {
        titlePrefix: "会话",
        back: "返回会话",
        missing: "缺少 sessionId。",
        notFound: "没有找到这个会话。",
        loadError: "无法加载会话详情。",
        sessionInfo: "会话信息",
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
        city: "城市",
        os: "系统",
        browser: "浏览器",
        device: "设备",
        screen: "屏幕",
        visitedPages: "访问页面",
        eventDistribution: "事件分布",
        yes: "是",
        no: "否",
      }
    : {
        titlePrefix: "Session",
        back: "Back to sessions",
        missing: "Missing sessionId.",
        notFound: "Session not found.",
        loadError: "Unable to load session detail.",
        sessionInfo: "Session info",
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
        city: "City",
        os: "OS",
        browser: "Browser",
        device: "Device",
        screen: "Screen",
        visitedPages: "Visited pages",
        eventDistribution: "Event distribution",
        yes: "Yes",
        no: "No",
      };
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4 border-t border-border/70 px-4 py-2 first:border-t-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-[11px] text-foreground">
        {value}
      </span>
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

function EventsPanel({
  locale,
  title,
  events,
}: {
  locale: Locale;
  title: string;
  events: JourneyEvent[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-0">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-center gap-3 border-t border-border/70 px-4 py-3 first:border-t-0"
          >
            <EventIcon event={event} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {event.kind === "pageview" ? formatPath(event.pathname) : event.eventType}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {event.title || event.hostname || event.visitId}
              </p>
            </div>
            <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {formatShortDateTime(locale, event.occurredAt)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
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
  detail: SessionDetail;
  pathname: string;
}) {
  const session = detail.session;
  const sessionsPath = pathname.replace(/\/detail$/, "");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={sessionsPath}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RiArrowLeftLine className="size-3.5" />
          {labels.back}
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {labels.titlePrefix}: {session.sessionId}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <LocationMeta
              locale={locale}
              messages={messages}
              country={session.country}
              region={session.region}
              city={session.city}
            />
            <DeviceMeta
              deviceType={session.deviceType}
              locale={locale}
              unknownLabel={messages.common.unknown}
            />
            <OsMeta os={session.os} version={session.osVersion} unknownLabel={messages.common.unknown} />
            <BrowserMeta browser={session.browser} version={session.browserVersion} unknownLabel={messages.common.unknown} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[20.5rem_1fr]">
        <div className="space-y-6">
          <Card className="py-0">
            <CardHeader className="py-4">
              <CardTitle>{labels.sessionInfo}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <InfoRow label={labels.duration} value={formatDuration(locale, session.durationMs)} />
              <InfoRow label={labels.createdAt} value={formatShortDateTime(locale, session.startedAt)} />
              <InfoRow label={labels.endedAt} value={formatShortDateTime(locale, session.endedAt)} />
              <InfoRow label={labels.screenViews} value={numberFormat(locale, session.views)} />
              <InfoRow label={labels.events} value={numberFormat(locale, session.events)} />
              <InfoRow label={labels.bounce} value={session.bounce ? labels.yes : labels.no} />
              <InfoRow label={labels.entryPath} value={formatPath(session.entryPath)} />
              <InfoRow label={labels.exitPath} value={formatPath(session.exitPath)} />
              <InfoRow
                label={labels.referrerName}
                value={<ReferrerMeta referrerHost={session.referrerHost} referrerUrl={session.referrerUrl} directLabel={messages.overview.direct} className="justify-end" />}
              />
              <InfoRow label={labels.country} value={session.country || messages.common.unknown} />
              <InfoRow label={labels.city} value={session.city || messages.common.unknown} />
              <InfoRow label={labels.os} value={session.osVersion || session.os || messages.common.unknown} />
              <InfoRow label={labels.browser} value={session.browser || messages.common.unknown} />
              <InfoRow label={labels.device} value={session.deviceType || messages.common.unknown} />
              <InfoRow label={labels.screen} value={formatScreen(session.screenWidth, session.screenHeight)} />
            </CardContent>
          </Card>

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

        <EventsPanel locale={locale} title={labels.events} events={detail.events} />
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
      pathname={pathname}
    />
  );
}
