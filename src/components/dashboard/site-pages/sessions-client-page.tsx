"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { RiSearchLine } from "@remixicon/react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";
import {
  BrowserMeta,
  CountryRegionMeta,
  DeviceMeta,
  formatDuration,
  formatPath,
  formatRelativeTime,
  OsMeta,
  ReferrerMeta,
  VisitorAvatar,
} from "@/components/dashboard/journey-display";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { numberFormat } from "@/lib/dashboard/format";
import { fetchSessions } from "@/lib/dashboard/client-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import type { JourneySession } from "@/lib/edge-client";
import { cn } from "@/lib/utils";

interface SessionsClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

const SESSION_LIMIT = 250;
const SESSION_INITIAL_ROWS = 40;
const SESSION_LOAD_STEP = 40;
const SESSION_SKELETON_ROWS = 8;

function copy(locale: Locale) {
  return locale === "zh"
    ? {
        search: "搜索会话...",
        started: "开始时间",
        sessionId: "会话 ID",
        visitor: "访客",
        anonymous: "匿名访客",
        entryPage: "入口页面",
        exitPage: "退出页面",
        duration: "时长",
        bounce: "跳出",
        referrer: "来源",
        location: "地区",
        os: "系统",
        browser: "浏览器",
        device: "设备",
        pageViews: "页面浏览",
        yes: "是",
        no: "否",
        loadError: "无法加载会话数据。",
        empty: "当前时间范围内没有会话。",
      }
    : {
        search: "Search sessions...",
        started: "Start Time",
        sessionId: "Session ID",
        visitor: "Visitor",
        anonymous: "Anonymous",
        entryPage: "Entry Page",
        exitPage: "Exit Page",
        duration: "Duration",
        bounce: "Bounce",
        referrer: "Referrer",
        location: "Location",
        os: "OS",
        browser: "Browser",
        device: "Device",
        pageViews: "Page Views",
        yes: "Yes",
        no: "No",
        loadError: "Unable to load sessions.",
        empty: "No sessions in this time range.",
      };
}

function shortId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 9)}...`;
}

function matchesSession(row: JourneySession, query: string): boolean {
  if (!query) return true;
  const target = [
    row.sessionId,
    row.visitorId,
    row.entryPath,
    row.exitPath,
    row.referrerHost,
    row.referrerUrl,
    row.country,
    row.region,
    row.city,
    row.browser,
    row.os,
    row.deviceType,
  ].join(" ").toLocaleLowerCase();
  return target.includes(query.toLocaleLowerCase());
}

function SessionRowSkeleton({
  index,
  sentinelRef,
}: {
  index: number;
  sentinelRef?: (node: HTMLTableRowElement | null) => void;
}) {
  const widths = [
    "w-28",
    "w-24",
    "w-20",
    "w-16",
    "w-10",
    "w-24",
    "w-28",
    "w-24",
    "w-24",
    "w-20",
    "w-36",
    "w-36",
  ];

  return (
    <TableRow ref={sentinelRef} aria-hidden="true">
      {widths.map((width, cellIndex) => (
        <TableCell key={`${index}-${cellIndex}`} className={cellIndex === 0 ? "pl-4" : undefined}>
          {cellIndex === 0 ? (
            <div className="flex items-center gap-2">
              <Skeleton className="size-6 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          ) : (
            <Skeleton
              className={cn(
                "h-4",
                width,
                cellIndex === 3 && "ml-auto",
                cellIndex === 4 && "mx-auto",
              )}
            />
          )}
        </TableCell>
      ))}
    </TableRow>
  );
}

function PageViewsValue({ locale, views }: { locale: Locale; views: number }) {
  const value = numberFormat(locale, views);
  if (views === 1) {
    return (
      <span className="font-mono font-semibold tabular-nums text-amber-600 dark:text-amber-400">
        {value}
      </span>
    );
  }
  return <span className="font-mono tabular-nums">{value}</span>;
}

export function SessionsClientPage({
  locale,
  messages,
  siteId,
  pathname,
}: SessionsClientPageProps) {
  const router = useRouter();
  const labels = copy(locale);
  const { filters, window: timeWindow } = useDashboardQuery() as {
    filters: DashboardFilters;
    window: TimeWindow;
  };
  const [rows, setRows] = useState<JourneySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [visibleCount, setVisibleCount] = useState(SESSION_INITIAL_ROWS);
  const sentinelRef = useRef<HTMLTableRowElement | null>(null);
  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const requestKey = useMemo(
    () => [siteId, timeWindow.from, timeWindow.to, filtersKey].join(":"),
    [filtersKey, siteId, timeWindow.from, timeWindow.to],
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setVisibleCount(SESSION_INITIAL_ROWS);
    fetchSessions(siteId, timeWindow, filters, { limit: SESSION_LIMIT })
      .then((payload) => {
        if (!active) return;
        setRows(payload.data);
      })
      .catch(() => {
        if (!active) return;
        setRows([]);
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestKey]);

  useEffect(() => {
    setVisibleCount(SESSION_INITIAL_ROWS);
  }, [query]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesSession(row, query.trim())),
    [query, rows],
  );
  const visibleRows = useMemo(
    () => filteredRows.slice(0, Math.min(visibleCount, filteredRows.length)),
    [filteredRows, visibleCount],
  );
  const hasMoreRows = visibleRows.length < filteredRows.length;

  useEffect(() => {
    const target = sentinelRef.current;
    if (
      !target ||
      loading ||
      error ||
      !hasMoreRows ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setVisibleCount((current) =>
          Math.min(current + SESSION_LOAD_STEP, filteredRows.length),
        );
      },
      {
        root: null,
        rootMargin: "360px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [error, filteredRows.length, hasMoreRows, loading, visibleRows.length]);

  const openSession = (href: string) => {
    router.push(href);
  };

  const handleSessionKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    href: string,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openSession(href);
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.sessions.title}
        subtitle={messages.sessions.subtitle}
      />

      <div className="relative w-full sm:max-w-xs">
        <RiSearchLine className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.search}
          className="pl-8"
        />
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{labels.visitor}</TableHead>
                <TableHead>{labels.sessionId}</TableHead>
                <TableHead>{labels.started}</TableHead>
                <TableHead className="text-center">{labels.duration}</TableHead>
                <TableHead className="text-center">{labels.pageViews}</TableHead>
                <TableHead>{labels.referrer}</TableHead>
                <TableHead>{labels.location}</TableHead>
                <TableHead>{labels.os}</TableHead>
                <TableHead>{labels.browser}</TableHead>
                <TableHead>{labels.device}</TableHead>
                <TableHead>{labels.entryPage}</TableHead>
                <TableHead>{labels.exitPage}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody aria-busy={loading}>
              {loading ? (
                Array.from({ length: SESSION_SKELETON_ROWS }, (_, index) => (
                  <SessionRowSkeleton key={`initial-skeleton-${index}`} index={index} />
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-28 text-center text-muted-foreground">
                    {labels.loadError}
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-28 text-center text-muted-foreground">
                    {labels.empty}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {visibleRows.map((row) => {
                  const href = `${pathname}/detail?sessionId=${encodeURIComponent(row.sessionId)}`;
                  return (
                    <TableRow
                      key={row.sessionId}
                      role="link"
                      tabIndex={0}
                      aria-label={`${labels.sessionId}: ${row.sessionId}`}
                      data-session-row=""
                      className="group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                      onClick={() => openSession(href)}
                      onKeyDown={(event) => handleSessionKeyDown(event, href)}
                    >
                      <TableCell className="pl-4">
                        <div className="flex min-w-36 items-center gap-2">
                          <VisitorAvatar seed={row.visitorId} className="size-6" />
                          <span className="truncate">{labels.anonymous}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono font-medium">{shortId(row.sessionId)}</span>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {formatRelativeTime(locale, row.startedAt, now)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatDuration(locale, row.durationMs)}
                      </TableCell>
                      <TableCell className="text-center">
                        <PageViewsValue locale={locale} views={row.views} />
                      </TableCell>
                      <TableCell className="max-w-48">
                        <ReferrerMeta
                          referrerHost={row.referrerHost}
                          referrerUrl={row.referrerUrl}
                          directLabel={messages.overview.direct}
                        />
                      </TableCell>
                      <TableCell className="max-w-52">
                        <CountryRegionMeta
                          locale={locale}
                          messages={messages}
                          country={row.country}
                          region={row.region}
                        />
                      </TableCell>
                      <TableCell className="max-w-40">
                        <OsMeta
                          os={row.os}
                          version={row.osVersion}
                          unknownLabel={messages.common.unknown}
                        />
                      </TableCell>
                      <TableCell className="max-w-40">
                        <BrowserMeta
                          browser={row.browser}
                          version={row.browserVersion}
                          unknownLabel={messages.common.unknown}
                        />
                      </TableCell>
                      <TableCell className="max-w-36">
                        <DeviceMeta
                          deviceType={row.deviceType}
                          unknownLabel={messages.common.unknown}
                        />
                      </TableCell>
                      <TableCell className="max-w-56 truncate font-mono">
                        {formatPath(row.entryPath)}
                      </TableCell>
                      <TableCell className="max-w-56 truncate pr-4 font-mono">
                        {formatPath(row.exitPath)}
                      </TableCell>
                    </TableRow>
                  );
                  })}
                  {hasMoreRows
                    ? Array.from({ length: SESSION_SKELETON_ROWS }, (_, index) => (
                        <SessionRowSkeleton
                          key={`append-skeleton-${visibleRows.length}-${index}`}
                          index={index}
                          sentinelRef={index === 0 ? (node) => {
                            sentinelRef.current = node;
                          } : undefined}
                        />
                      ))
                    : null}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
