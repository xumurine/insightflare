"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiSearchLine,
} from "@remixicon/react";

import { ClickableTableCell } from "@/components/dashboard/clickable-table-cell";
import {
  BrowserMeta,
  CountryRegionMeta,
  DeviceMeta,
  formatRelativeTime,
  OsMeta,
  ReferrerMeta,
  VisitorAvatar,
} from "@/components/dashboard/journey-display";
import { PageHeading } from "@/components/dashboard/page-heading";
import {
  DETAIL_QUERY_PARAM,
  DetailModal,
} from "@/components/dashboard/site-pages/detail-query-modal";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";
import { AutoTransition } from "@/components/ui/auto-transition";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  pushUrlWithoutNavigation,
  replaceUrlWithoutNavigation,
  useLiveSearchParams,
} from "@/lib/client-history";
import { fetchVisitors } from "@/lib/dashboard/client-data";
import { numberFormat } from "@/lib/dashboard/format";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { VisitorsData, VisitorsMeta } from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

interface VisitorsClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

type VisitorRow = VisitorsData["data"][number];

const VISITOR_PAGE_SIZE = 80;
const VISITOR_SKELETON_ROWS = 8;

const VisitorDetailClientPage = dynamic(
  () =>
    import("@/components/dashboard/site-pages/visitor-detail-client-page").then(
      (module) => module.VisitorDetailClientPage,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 text-sm text-muted-foreground">Loading...</div>
    ),
  },
);

type SortDirection = "asc" | "desc";
type VisitorSortKey = "firstSeenAt" | "lastSeenAt" | "sessions" | "views";

interface VisitorSortState {
  key: VisitorSortKey;
  direction: SortDirection;
}

const DEFAULT_VISITOR_SORT: VisitorSortState = {
  key: "lastSeenAt",
  direction: "desc",
};

const INITIAL_VISITOR_META: VisitorsMeta = {
  page: 1,
  pageSize: VISITOR_PAGE_SIZE,
  returned: 0,
  hasMore: false,
  nextPage: null,
};

function shortId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 9)}...`;
}

function VisitorRowSkeleton({
  index,
  sentinelRef,
}: {
  index: number;
  sentinelRef?: (node: HTMLTableRowElement | null) => void;
}) {
  const widths = [
    "w-24",
    "w-24",
    "w-20",
    "w-20",
    "w-12",
    "w-10",
    "w-24",
    "w-28",
    "w-24",
    "w-24",
    "w-20",
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
                cellIndex === 4 && "ml-auto",
                cellIndex === 5 && "mx-auto",
              )}
            />
          )}
        </TableCell>
      ))}
    </TableRow>
  );
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

function appendUniqueVisitors(
  current: VisitorRow[],
  incoming: VisitorRow[],
): VisitorRow[] {
  if (current.length === 0) return incoming;
  const seen = new Set(current.map((row) => row.visitorId));
  const nextRows = incoming.filter((row) => !seen.has(row.visitorId));
  return nextRows.length > 0 ? [...current, ...nextRows] : current;
}

function SessionIdValue({ value }: { value?: string }) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return <span className="font-mono text-muted-foreground">/</span>;
  }
  return <span className="font-mono font-medium">{shortId(normalized)}</span>;
}

function detailQueryTarget(
  pathname: string,
  searchParams: URLSearchParams,
  detailId: string,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set(DETAIL_QUERY_PARAM, detailId);
  params.delete("visitorId");
  params.delete("sessionId");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function VisitorsClientPage({
  locale,
  messages,
  siteId,
  pathname,
}: VisitorsClientPageProps) {
  const labels = messages.visitors;
  const { filters, window: timeWindow } = useDashboardQuery() as {
    filters: DashboardFilters;
    window: TimeWindow;
  };
  const [rows, setRows] = useState<VisitorRow[]>([]);
  const [meta, setMeta] = useState<VisitorsMeta>(INITIAL_VISITOR_META);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [appendError, setAppendError] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<VisitorSortState>(DEFAULT_VISITOR_SORT);
  const [now, setNow] = useState(() => Date.now());
  const [sentinelNode, setSentinelNode] = useState<HTMLTableRowElement | null>(
    null,
  );
  const searchParams = useLiveSearchParams();
  const detailVisitorId = searchParams.get(DETAIL_QUERY_PARAM)?.trim() || "";
  const openedDetailFromListRef = useRef(false);
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
  const replacingRows =
    loadingInitial || latestRequestKeyRef.current !== requestKey;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!detailVisitorId) {
      openedDetailFromListRef.current = false;
    }
  }, [detailVisitorId]);

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
        const payload = await fetchVisitors(siteId, timeWindow, filters, {
          page,
          pageSize: VISITOR_PAGE_SIZE,
          sortBy: sort.key,
          sortDir: sort.direction,
          search: debouncedQuery,
        });
        if (latestRequestKeyRef.current !== capturedRequestKey) return;

        setRows((current) =>
          mode === "append"
            ? appendUniqueVisitors(current, payload.data)
            : payload.data,
        );
        setMeta(payload.meta);
        setError(false);
        setAppendError(false);
      } catch {
        if (latestRequestKeyRef.current !== capturedRequestKey) return;
        if (mode === "replace") {
          setRows([]);
          setMeta(INITIAL_VISITOR_META);
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
    setMeta(INITIAL_VISITOR_META);
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

  const toggleSort = (key: VisitorSortKey) => {
    setSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === "desc" ? "asc" : "desc",
          }
        : { key, direction: "desc" },
    );
  };

  const openVisitorDetail = useCallback(
    (visitorId: string) => {
      openedDetailFromListRef.current = true;
      pushUrlWithoutNavigation(
        detailQueryTarget(pathname, searchParams, visitorId),
      );
    },
    [pathname, searchParams],
  );

  const closeVisitorDetail = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(DETAIL_QUERY_PARAM)) return;

    if (openedDetailFromListRef.current) {
      openedDetailFromListRef.current = false;
      window.history.back();
      return;
    }

    params.delete(DETAIL_QUERY_PARAM);
    const query = params.toString();
    replaceUrlWithoutNavigation(query ? `${pathname}?${query}` : pathname);
  }, [pathname]);

  const bodyState = replacingRows
    ? "loading"
    : error
      ? "error"
      : rows.length === 0 && !meta.hasMore
        ? "empty"
        : "rows";

  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.visitors.title}
        subtitle={messages.visitors.subtitle}
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
                <TableHead className="w-32 pl-4">{labels.visitor}</TableHead>
                <TableHead>{labels.sessionId}</TableHead>
                <SortHeader
                  label={labels.firstSeen}
                  active={sort.key === "firstSeenAt"}
                  direction={sort.direction}
                  onClick={() => toggleSort("firstSeenAt")}
                />
                <SortHeader
                  label={labels.lastSeen}
                  active={sort.key === "lastSeenAt"}
                  direction={sort.direction}
                  onClick={() => toggleSort("lastSeenAt")}
                />
                <SortHeader
                  label={labels.sessions}
                  active={sort.key === "sessions"}
                  direction={sort.direction}
                  onClick={() => toggleSort("sessions")}
                  align="right"
                  className="text-right"
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
                <TableHead className="pr-4">{labels.device}</TableHead>
              </TableRow>
            </TableHeader>
            <AutoTransition
              as="tbody"
              transitionKey={bodyState}
              initial={false}
              duration={0.18}
              type="fade"
              presenceMode="wait"
              aria-busy={replacingRows || loadingMore}
              data-slot="table-body"
              className="[&_tr:last-child]:border-0"
            >
              {replacingRows ? (
                Array.from({ length: VISITOR_SKELETON_ROWS }, (_, index) => (
                  <VisitorRowSkeleton
                    key={`initial-skeleton-${index}`}
                    index={index}
                  />
                ))
              ) : error ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="h-28 text-center text-muted-foreground"
                  >
                    {labels.loadError}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 && !meta.hasMore ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="h-28 text-center text-muted-foreground"
                  >
                    {labels.empty}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {rows.map((row) => {
                    const openDetail = () => openVisitorDetail(row.visitorId);
                    return (
                      <TableRow
                        key={row.visitorId}
                        className="group cursor-pointer"
                      >
                        <ClickableTableCell
                          onClick={openDetail}
                          className="w-32"
                          buttonClassName="pl-4"
                          focusable
                          ariaLabel={`${labels.visitor}: ${row.visitorId}`}
                        >
                          <div className="flex w-28 items-center gap-2">
                            <VisitorAvatar
                              seed={row.visitorId}
                              className="size-6"
                            />
                            <span className="truncate">{labels.anonymous}</span>
                          </div>
                        </ClickableTableCell>
                        <ClickableTableCell onClick={openDetail}>
                          <SessionIdValue value={row.sessionId} />
                        </ClickableTableCell>
                        <ClickableTableCell
                          onClick={openDetail}
                          className="font-mono text-muted-foreground"
                        >
                          {formatRelativeTime(locale, row.firstSeenAt, now)}
                        </ClickableTableCell>
                        <ClickableTableCell
                          onClick={openDetail}
                          className="font-mono text-muted-foreground"
                        >
                          {formatRelativeTime(locale, row.lastSeenAt, now)}
                        </ClickableTableCell>
                        <ClickableTableCell
                          onClick={openDetail}
                          className="text-right font-mono tabular-nums"
                        >
                          {numberFormat(locale, row.sessions)}
                        </ClickableTableCell>
                        <ClickableTableCell
                          onClick={openDetail}
                          className="text-center"
                        >
                          <span className="font-mono tabular-nums">
                            {numberFormat(locale, row.views)}
                          </span>
                        </ClickableTableCell>
                        <ClickableTableCell
                          onClick={openDetail}
                          className="max-w-48"
                        >
                          <ReferrerMeta
                            referrerHost={row.referrerHost || ""}
                            referrerUrl={row.referrerUrl}
                            directLabel={messages.overview.direct}
                          />
                        </ClickableTableCell>
                        <ClickableTableCell
                          onClick={openDetail}
                          className="max-w-52"
                        >
                          <CountryRegionMeta
                            locale={locale}
                            messages={messages}
                            country={row.country || ""}
                            region={row.region}
                            regionCode={row.regionCode}
                          />
                        </ClickableTableCell>
                        <ClickableTableCell
                          onClick={openDetail}
                          className="max-w-40"
                        >
                          <OsMeta
                            os={row.os || ""}
                            version={row.osVersion}
                            unknownLabel={messages.common.unknown}
                          />
                        </ClickableTableCell>
                        <ClickableTableCell
                          onClick={openDetail}
                          className="max-w-40"
                        >
                          <BrowserMeta
                            browser={row.browser || ""}
                            version={row.browserVersion}
                            unknownLabel={messages.common.unknown}
                          />
                        </ClickableTableCell>
                        <ClickableTableCell
                          onClick={openDetail}
                          className="max-w-36"
                          buttonClassName="pr-4"
                        >
                          <DeviceMeta
                            deviceType={row.deviceType || ""}
                            deviceLabels={messages.common.deviceLabels}
                            unknownLabel={messages.common.unknown}
                          />
                        </ClickableTableCell>
                      </TableRow>
                    );
                  })}
                  {appendError ? (
                    <TableRow>
                      <TableCell
                        colSpan={11}
                        className="h-16 text-center text-muted-foreground"
                      >
                        {labels.loadError}
                      </TableCell>
                    </TableRow>
                  ) : meta.hasMore ? (
                    Array.from(
                      { length: VISITOR_SKELETON_ROWS },
                      (_, index) => (
                        <VisitorRowSkeleton
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
            </AutoTransition>
          </Table>
        </CardContent>
      </Card>

      {detailVisitorId ? (
        <DetailModal
          ariaLabel={messages.visitors.title}
          modalKey={`visitor:${detailVisitorId}`}
          onClose={closeVisitorDetail}
        >
          <VisitorDetailClientPage
            locale={locale}
            messages={messages}
            siteId={siteId}
            pathname={pathname}
            visitorId={detailVisitorId}
          />
        </DetailModal>
      ) : null}
    </div>
  );
}
