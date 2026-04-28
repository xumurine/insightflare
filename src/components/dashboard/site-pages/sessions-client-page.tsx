"use client";

import {
  type KeyboardEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiSearchLine,
} from "@remixicon/react";

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
import { PageHeading } from "@/components/dashboard/page-heading";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";
import { AutoTransition } from "@/components/ui/auto-transition";
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
import { fetchSessions } from "@/lib/dashboard/client-data";
import { numberFormat } from "@/lib/dashboard/format";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { JourneySession, SessionsMeta } from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { navigateWithTransition } from "@/lib/page-transition";
import { cn } from "@/lib/utils";

interface SessionsClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

const SESSION_PAGE_SIZE = 80;
const SESSION_SKELETON_ROWS = 8;

type SortDirection = "asc" | "desc";
type SessionSortKey = "startedAt" | "durationMs" | "views";

interface SessionSortState {
  key: SessionSortKey;
  direction: SortDirection;
}

const DEFAULT_SESSION_SORT: SessionSortState = {
  key: "startedAt",
  direction: "desc",
};

const INITIAL_SESSION_META: SessionsMeta = {
  page: 1,
  pageSize: SESSION_PAGE_SIZE,
  returned: 0,
  hasMore: false,
  nextPage: null,
};

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
        <TableCell
          key={`${index}-${cellIndex}`}
          className={cellIndex === 0 ? "pl-4" : undefined}
        >
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

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (active) {
    return direction === "desc" ? (
      <RiArrowDownSLine className="size-3.5" />
    ) : (
      <RiArrowUpSLine className="size-3.5" />
    );
  }

  return (
    <span className="inline-flex flex-col leading-none text-muted-foreground">
      <RiArrowUpSLine className="-mb-1 size-3.5" />
      <RiArrowDownSLine className="-mt-1 size-3.5" />
    </span>
  );
}

function SortHeader({
  label,
  active,
  direction,
  onClick,
  align = "left",
  className,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  return (
    <TableHead
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
      className={className}
    >
      <div
        className={cn(
          "flex",
          align === "center" && "justify-center",
          align === "right" && "justify-end",
        )}
      >
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            active ? "text-foreground" : "text-muted-foreground",
          )}
          onClick={onClick}
        >
          {label}
          <SortIndicator active={active} direction={direction} />
        </button>
      </div>
    </TableHead>
  );
}

function appendUniqueSessions(
  current: JourneySession[],
  incoming: JourneySession[],
): JourneySession[] {
  if (current.length === 0) return incoming;
  const seen = new Set(current.map((row) => row.sessionId));
  const nextRows = incoming.filter((row) => !seen.has(row.sessionId));
  return nextRows.length > 0 ? [...current, ...nextRows] : current;
}

function isSessionActive(row: JourneySession, now: number): boolean {
  if (typeof row.active === "boolean") return row.active;
  return row.endedAt > now - 5 * 60 * 1000;
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
  const [meta, setMeta] = useState<SessionsMeta>(INITIAL_SESSION_META);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [appendError, setAppendError] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<SessionSortState>(DEFAULT_SESSION_SORT);
  const [now, setNow] = useState(() => Date.now());
  const [sentinelNode, setSentinelNode] = useState<HTMLTableRowElement | null>(
    null,
  );
  const latestRequestKeyRef = useRef("");
  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const requestKey = useMemo(
    () =>
      [
        siteId,
        timeWindow.from,
        timeWindow.to,
        filtersKey,
        debouncedQuery,
        sort.key,
        sort.direction,
      ].join(":"),
    [
      debouncedQuery,
      filtersKey,
      siteId,
      sort.direction,
      sort.key,
      timeWindow.from,
      timeWindow.to,
    ],
  );
  const tableTransitionKey = `sessions-table-${debouncedQuery || "all"}`;
  const replacingRows =
    loadingInitial || latestRequestKeyRef.current !== requestKey;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const loadPage = useEffectEvent(
    async (page: number, mode: "replace" | "append") => {
      const capturedRequestKey = latestRequestKeyRef.current;

      if (mode === "replace") {
        setLoadingInitial(true);
        setError(false);
        setAppendError(false);
      } else {
        setLoadingMore(true);
        setAppendError(false);
      }

      try {
        const payload = await fetchSessions(siteId, timeWindow, filters, {
          page,
          pageSize: SESSION_PAGE_SIZE,
          sortBy: sort.key,
          sortDir: sort.direction,
          search: debouncedQuery,
        });
        if (latestRequestKeyRef.current !== capturedRequestKey) return;

        setRows((current) =>
          mode === "append"
            ? appendUniqueSessions(current, payload.data)
            : payload.data,
        );
        setMeta(payload.meta);
        setError(false);
        setAppendError(false);
      } catch {
        if (latestRequestKeyRef.current !== capturedRequestKey) return;
        if (mode === "replace") {
          setRows([]);
          setMeta(INITIAL_SESSION_META);
          setError(true);
          setAppendError(false);
        } else {
          setAppendError(true);
        }
      } finally {
        if (latestRequestKeyRef.current === capturedRequestKey) {
          if (mode === "replace") {
            setLoadingInitial(false);
          } else {
            setLoadingMore(false);
          }
        }
      }
    },
  );

  const loadNextPage = useEffectEvent(() => {
    if (
      loadingInitial ||
      loadingMore ||
      appendError ||
      !meta.hasMore ||
      meta.nextPage === null
    ) {
      return;
    }
    void loadPage(meta.nextPage, "append");
  });

  useEffect(() => {
    latestRequestKeyRef.current = requestKey;
    setRows([]);
    setMeta(INITIAL_SESSION_META);
    setError(false);
    setAppendError(false);
    void loadPage(1, "replace");
  }, [requestKey]);

  useEffect(() => {
    const target = sentinelNode;
    if (
      !target ||
      loadingInitial ||
      loadingMore ||
      appendError ||
      error ||
      !meta.hasMore ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          loadNextPage();
        }
      },
      {
        root: null,
        rootMargin: "360px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(target);
    const frameId = window.requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 480 && rect.bottom >= -480) {
        loadNextPage();
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [
    appendError,
    error,
    loadingInitial,
    loadingMore,
    meta.hasMore,
    meta.nextPage,
    sentinelNode,
  ]);

  const openSession = (href: string) => {
    navigateWithTransition(router, href);
  };

  const toggleSort = (key: SessionSortKey) => {
    setSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === "desc" ? "asc" : "desc",
          }
        : { key, direction: "desc" },
    );
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

      <AutoTransition
        type="fade"
        duration={0.18}
        initial={false}
        className="w-full"
      >
        <Card key={tableTransitionKey} className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32 pl-4">{labels.visitor}</TableHead>
                  <TableHead>{labels.sessionId}</TableHead>
                  <SortHeader
                    label={labels.started}
                    active={sort.key === "startedAt"}
                    direction={sort.direction}
                    onClick={() => toggleSort("startedAt")}
                  />
                  <SortHeader
                    label={labels.duration}
                    active={sort.key === "durationMs"}
                    direction={sort.direction}
                    onClick={() => toggleSort("durationMs")}
                    align="center"
                    className="text-center"
                  />
                  <SortHeader
                    label={labels.pageViews}
                    active={sort.key === "views"}
                    direction={sort.direction}
                    onClick={() => toggleSort("views")}
                    align="center"
                    className="text-center"
                  />
                  <TableHead>{labels.referrer}</TableHead>
                  <TableHead>{labels.location}</TableHead>
                  <TableHead>{labels.os}</TableHead>
                  <TableHead>{labels.browser}</TableHead>
                  <TableHead>{labels.device}</TableHead>
                  <TableHead>{labels.entryPage}</TableHead>
                  <TableHead>{labels.exitPage}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody aria-busy={replacingRows || loadingMore}>
                {replacingRows ? (
                  Array.from({ length: SESSION_SKELETON_ROWS }, (_, index) => (
                    <SessionRowSkeleton
                      key={`initial-skeleton-${index}`}
                      index={index}
                    />
                  ))
                ) : error ? (
                  <TableRow>
                    <TableCell
                      colSpan={12}
                      className="h-28 text-center text-muted-foreground"
                    >
                      {labels.loadError}
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 && !meta.hasMore ? (
                  <TableRow>
                    <TableCell
                      colSpan={12}
                      className="h-28 text-center text-muted-foreground"
                    >
                      {labels.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {rows.map((row) => {
                      const href = `${pathname}/detail?sessionId=${encodeURIComponent(row.sessionId)}`;
                      const active = isSessionActive(row, now);
                      return (
                        <TableRow
                          key={row.sessionId}
                          role="link"
                          tabIndex={0}
                          aria-label={`${labels.sessionId}: ${row.sessionId}`}
                          data-session-row=""
                          className="group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                          onClick={() => openSession(href)}
                          onKeyDown={(event) =>
                            handleSessionKeyDown(event, href)
                          }
                        >
                          <TableCell className="w-32 pl-4">
                            <div className="flex w-28 items-center gap-2">
                              <VisitorAvatar
                                seed={row.visitorId}
                                className="size-6"
                              />
                              <span className="truncate">
                                {labels.anonymous}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono font-medium">
                              {shortId(row.sessionId)}
                            </span>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "font-mono",
                              active
                                ? "text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
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
                              regionCode={row.regionCode}
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
                              locale={locale}
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
                    {appendError ? (
                      <TableRow>
                        <TableCell
                          colSpan={12}
                          className="h-16 text-center text-muted-foreground"
                        >
                          {labels.loadError}
                        </TableCell>
                      </TableRow>
                    ) : meta.hasMore ? (
                      Array.from(
                        { length: SESSION_SKELETON_ROWS },
                        (_, index) => (
                          <SessionRowSkeleton
                            key={`append-skeleton-${rows.length}-${index}`}
                            index={index}
                            sentinelRef={
                              index === 0 ? setSentinelNode : undefined
                            }
                          />
                        ),
                      )
                    ) : null}
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </AutoTransition>
    </div>
  );
}
