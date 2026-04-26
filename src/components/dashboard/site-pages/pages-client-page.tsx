"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  RiArrowDownLine,
  RiArrowRightSLine,
  RiArrowUpLine,
} from "@remixicon/react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { PagesShareTrendCard } from "@/components/dashboard/pages-share-trend-card";
import { TrafficPairBarChart } from "@/components/dashboard/site-traffic-charts";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  durationFormat,
  intlLocale,
  numberFormat,
  percentFormat,
} from "@/lib/dashboard/format";
import { buildPageDetailHref } from "@/lib/dashboard/page-detail";
import {
  fetchPagesDashboard,
  type PagesDashboardRow,
} from "@/lib/dashboard/client-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

const PAGE_CARD_PAGE_SIZE = 12;
const PAGE_CARD_CHART_MAX_POINTS = 36;

interface PagesMeta {
  page: number;
  pageSize: number;
  returned: number;
  hasMore: boolean;
  nextPage: number | null;
}

interface PagesClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

const INITIAL_META: PagesMeta = {
  page: 1,
  pageSize: PAGE_CARD_PAGE_SIZE,
  returned: 0,
  hasMore: false,
  nextPage: null,
};

function formatChangeRate(value: number | null): string | null {
  if (value === null) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function changeRateClass(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  return value >= 0 ? "text-emerald-600" : "text-rose-600";
}

function ChangeRateInline({ value }: { value: number | null }) {
  if (value === null) return null;
  const Icon = value >= 0 ? RiArrowUpLine : RiArrowDownLine;
  return (
    <span
      className={`inline-flex items-end gap-0.5 font-mono text-xs leading-none ${changeRateClass(value)}`}
    >
      <Icon className="size-3.5" />
      {formatChangeRate(value)}
    </span>
  );
}

function PageMetricField({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: number | null;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground">{label}</p>
      <p className="inline-flex items-end gap-1.5 font-mono text-base leading-none">
        {value}
        <ChangeRateInline value={change} />
      </p>
    </div>
  );
}

function PageTrafficCard({
  item,
  interval,
  locale,
  messages,
  pagesPerSessionFormatter,
  href,
}: {
  item: PagesDashboardRow;
  interval: TimeWindow["interval"];
  locale: Locale;
  messages: AppMessages;
  pagesPerSessionFormatter: Intl.NumberFormat;
  href: string;
}) {
  const titles = item.titles.slice(0, 3);

  return (
    <Link
      href={href}
      className="group block h-full outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
      aria-label={`${messages.pages.viewDetails}: ${item.pathname}`}
      title={messages.pages.viewDetails}
    >
      <motion.div
        className="h-full"
        whileHover={{ scale: 1.012 }}
        whileTap={{ scale: 0.992 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
      >
        <Card className="h-full transition-colors group-hover:border-border/80 group-hover:bg-accent/15">
          <CardHeader className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                {titles.length > 0 ? (
                  <>
                    <CardTitle className="truncate">{titles[0]}</CardTitle>
                    {titles.slice(1).map((title) => (
                      <p
                        key={`${item.pathname}-${title}`}
                        className="truncate text-xs text-muted-foreground"
                      >
                        {title}
                      </p>
                    ))}
                  </>
                ) : (
                  <CardTitle className="text-muted-foreground">
                    {messages.pages.untitled}
                  </CardTitle>
                )}
                <p className="break-all font-mono text-[11px] text-muted-foreground">
                  {item.pathname}
                </p>
              </div>
              <span className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground">
                <RiArrowRightSLine className="size-4" />
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <TrafficPairBarChart
              data={item.trend}
              locale={locale}
              interval={interval}
              viewsLabel={messages.common.views}
              visitorsLabel={messages.common.visitors}
              maxPoints={PAGE_CARD_CHART_MAX_POINTS}
              className="h-[116px]"
            />

            <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-[11px] sm:grid-cols-3">
              <PageMetricField
                label={messages.common.views}
                value={numberFormat(locale, item.metrics.views)}
                change={item.changeRates.views}
              />
              <PageMetricField
                label={messages.common.visitors}
                value={numberFormat(locale, item.metrics.visitors)}
                change={item.changeRates.visitors}
              />
              <PageMetricField
                label={messages.common.sessions}
                value={numberFormat(locale, item.metrics.sessions)}
                change={item.changeRates.sessions}
              />
              <PageMetricField
                label={messages.common.bounceRate}
                value={percentFormat(locale, item.metrics.bounceRate)}
                change={item.changeRates.bounceRate}
              />
              <PageMetricField
                label={messages.pages.pagesPerSession}
                value={pagesPerSessionFormatter.format(item.metrics.pagesPerSession)}
                change={item.changeRates.pagesPerSession}
              />
              <PageMetricField
                label={messages.common.avgDuration}
                value={durationFormat(locale, item.metrics.avgDurationMs)}
                change={item.changeRates.avgDurationMs}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </Link>
  );
}

function PageTrafficCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-3 w-full" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-[116px] w-full" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="space-y-1">
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-5 w-4/5" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function PagesClientPage({
  locale,
  messages,
  siteId,
  pathname,
}: PagesClientPageProps) {
  const { filters, window } = useDashboardQuery() as {
    filters: DashboardFilters;
    window: TimeWindow;
  };
  const [items, setItems] = useState<PagesDashboardRow[]>([]);
  const [meta, setMeta] = useState<PagesMeta>(INITIAL_META);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appendError, setAppendError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const latestRequestKeyRef = useRef("");
  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const requestKey = useMemo(
    () =>
      [
        siteId,
        window.from,
        window.to,
        window.interval,
        filtersKey,
      ].join(":"),
    [siteId, window.from, window.to, window.interval, filtersKey],
  );
  const pagesPerSessionFormatter = useMemo(
    () =>
      new Intl.NumberFormat(intlLocale(locale), {
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  const loadPage = useEffectEvent(
    async (page: number, mode: "replace" | "append") => {
      const capturedRequestKey = latestRequestKeyRef.current;

      if (mode === "replace") {
        setLoadingInitial(true);
        setError(null);
        setAppendError(null);
      } else {
        setLoadingMore(true);
        setAppendError(null);
      }

      try {
        const payload = await fetchPagesDashboard(siteId, window, filters, {
          page,
          pageSize: PAGE_CARD_PAGE_SIZE,
        });
        if (latestRequestKeyRef.current !== capturedRequestKey) return;

        setItems((current) =>
          mode === "append" ? [...current, ...payload.data] : payload.data,
        );
        setMeta(payload.meta);
        setError(null);
        setAppendError(null);
      } catch {
        if (latestRequestKeyRef.current !== capturedRequestKey) return;
        if (mode === "replace") {
          setItems([]);
          setMeta(INITIAL_META);
          setError(messages.pages.loadError);
          setAppendError(null);
        } else {
          setAppendError(messages.pages.loadMoreError);
        }
      } finally {
        if (latestRequestKeyRef.current !== capturedRequestKey) return;
        if (mode === "replace") {
          setLoadingInitial(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
  );

  const loadNextPage = useEffectEvent(() => {
    if (
      loadingInitial ||
      loadingMore ||
      appendError !== null ||
      !meta.hasMore ||
      meta.nextPage === null
    ) {
      return;
    }
    void loadPage(meta.nextPage, "append");
  });

  useEffect(() => {
    latestRequestKeyRef.current = requestKey;
    setItems([]);
    setMeta(INITIAL_META);
    setError(null);
    setAppendError(null);
    void loadPage(1, "replace");
  }, [requestKey]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (
      !target ||
      loadingInitial ||
      loadingMore ||
      appendError !== null ||
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
        rootMargin: "480px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [appendError, loadingInitial, loadingMore, meta.hasMore]);

  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.pages.title}
        subtitle={messages.pages.subtitle}
      />

      <PagesShareTrendCard
        locale={locale}
        messages={messages}
        siteId={siteId}
        window={window}
        filters={filters}
      />

      {loadingInitial ? (
        <section
          className="grid gap-4 xl:grid-cols-2"
          aria-busy="true"
        >
          <p className="sr-only">{messages.pages.loading}</p>
          {Array.from({ length: 6 }, (_, index) => (
            <PageTrafficCardSkeleton key={index} />
          ))}
        </section>
      ) : null}

      {!loadingInitial && error ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {!loadingInitial && !error && items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {messages.pages.empty}
          </CardContent>
        </Card>
      ) : null}

      {items.length > 0 ? (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            {items.map((item) => (
              <PageTrafficCard
                key={item.pathname}
                item={item}
                interval={window.interval}
                locale={locale}
                messages={messages}
                pagesPerSessionFormatter={pagesPerSessionFormatter}
                href={buildPageDetailHref(pathname, item.pathname)}
              />
            ))}
          </section>

          <div className="flex min-h-10 items-center justify-center">
            {loadingMore ? (
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner className="size-4" />
                {messages.pages.loadingMore}
              </span>
            ) : appendError && meta.nextPage !== null ? (
              <span className="inline-flex items-center gap-3 text-xs text-muted-foreground">
                {appendError}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void loadPage(meta.nextPage!, "append");
                  }}
                >
                  {messages.pages.retry}
                </Button>
              </span>
            ) : null}
            {meta.hasMore ? (
              <div ref={sentinelRef} className="h-1 w-full" aria-hidden />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
