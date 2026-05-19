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
import { RiSearchLine } from "@remixicon/react";

import { PageHeading } from "@/components/dashboard/page-heading";
import {
  type SessionSortKey,
  type SessionSortState,
  SessionsTableCard,
} from "@/components/dashboard/sessions-table-card";
import {
  DETAIL_QUERY_PARAM,
  DetailModal,
} from "@/components/dashboard/site-pages/detail-query-modal";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";
import { Input } from "@/components/ui/input";
import {
  pushUrlWithoutNavigation,
  replaceUrlWithoutNavigation,
  useLiveSearchParams,
} from "@/lib/client-history";
import { fetchSessions } from "@/lib/dashboard/client-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { JourneySession, SessionsMeta } from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface SessionsClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

const SESSION_PAGE_SIZE = 80;
const SESSION_SKELETON_ROWS = 8;

const SessionDetailClientPage = dynamic(
  () =>
    import("@/components/dashboard/site-pages/session-detail-client-page").then(
      (module) => module.SessionDetailClientPage,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 text-sm text-muted-foreground">Loading...</div>
    ),
  },
);

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

function appendUniqueSessions(
  current: JourneySession[],
  incoming: JourneySession[],
): JourneySession[] {
  if (current.length === 0) return incoming;
  const seen = new Set(current.map((row) => row.sessionId));
  const nextRows = incoming.filter((row) => !seen.has(row.sessionId));
  return nextRows.length > 0 ? [...current, ...nextRows] : current;
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

export function SessionsClientPage({
  locale,
  messages,
  siteId,
  pathname,
}: SessionsClientPageProps) {
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
  const [sentinelNode, setSentinelNode] = useState<HTMLTableRowElement | null>(
    null,
  );
  const searchParams = useLiveSearchParams();
  const detailSessionId = searchParams.get(DETAIL_QUERY_PARAM)?.trim() || "";
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
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    if (!detailSessionId) {
      openedDetailFromListRef.current = false;
    }
  }, [detailSessionId]);

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

  const openSessionDetail = useCallback(
    (sessionId: string) => {
      openedDetailFromListRef.current = true;
      pushUrlWithoutNavigation(
        detailQueryTarget(pathname, searchParams, sessionId),
      );
    },
    [pathname, searchParams],
  );

  const closeSessionDetail = useCallback(() => {
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

      <SessionsTableCard
        locale={locale}
        messages={messages}
        labels={labels}
        rows={rows}
        onOpenSession={openSessionDetail}
        sort={sort}
        onSort={toggleSort}
        loadingRows={replacingRows}
        loadingMore={loadingMore}
        error={error}
        appendError={appendError}
        hasMore={meta.hasMore}
        skeletonRows={SESSION_SKELETON_ROWS}
        sentinelRef={setSentinelNode}
      />

      {detailSessionId ? (
        <DetailModal
          ariaLabel={locale === "zh" ? "会话详情" : "Session detail"}
          modalKey={`session:${detailSessionId}`}
          onClose={closeSessionDetail}
        >
          <SessionDetailClientPage
            locale={locale}
            messages={messages}
            siteId={siteId}
            pathname={pathname}
            sessionId={detailSessionId}
          />
        </DetailModal>
      ) : null}
    </div>
  );
}
