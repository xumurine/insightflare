"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  EventMetricGrid,
  EventPageHeader,
  EventRecordsSection,
  EventTrendStackedBarCard,
} from "@/components/dashboard/site-pages/event-analytics-components";
import {
  OverviewPagesSection,
  type OverviewPagesSectionCardData,
  parseOverviewCardFilters,
} from "@/components/dashboard/site-pages/overview-client-page";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";
import { useLiveSearchParams } from "@/lib/client-history";
import {
  fetchEventsSummary,
  fetchEventsTrend,
} from "@/lib/dashboard/client-data";
import type { TimeWindow } from "@/lib/dashboard/query-state";
import type { EventsSummaryData, EventsTrendData } from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { navigateWithTransition } from "@/lib/page-transition";

interface EventsClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  siteDomain: string;
  pathname: string;
}

function emptySummary(): EventsSummaryData {
  return {
    ok: true,
    summary: {
      events: 0,
      eventTypes: 0,
      sessions: 0,
      visitors: 0,
      avgEventsPerSession: 0,
    },
    cards: emptySummaryCards(),
  };
}

function emptySummaryCards(): EventsSummaryData["cards"] {
  return {
    event: {
      name: [],
    },
    page: {
      path: [],
      title: [],
      hostname: [],
    },
  };
}

function emptyOverviewPageSectionCards(): OverviewPagesSectionCardData {
  return {
    page: {
      path: [],
      query: [],
      title: [],
      hostname: [],
      entry: [],
      exit: [],
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

function buildEventCardDataOverride(
  rows: EventsSummaryData["cards"]["event"]["name"],
): OverviewPagesSectionCardData {
  const emptyCards = emptyOverviewPageSectionCards();
  return {
    ...emptyCards,
    page: {
      ...emptyCards.page,
      path: rows,
    },
  };
}

function buildContextCardDataOverride(
  page: EventsSummaryData["cards"]["page"],
): OverviewPagesSectionCardData {
  const emptyCards = emptyOverviewPageSectionCards();
  return {
    ...emptyCards,
    page: {
      ...emptyCards.page,
      path: page.path,
      title: page.title,
      hostname: page.hostname,
    },
  };
}

function emptyTrend(interval: TimeWindow["interval"]): EventsTrendData {
  return {
    ok: true,
    interval,
    series: [],
    data: [],
  };
}

export function EventsClientPage({
  locale,
  messages,
  siteId,
  siteDomain,
  pathname,
}: EventsClientPageProps) {
  const labels = messages.events;
  const router = useRouter();
  const searchParams = useLiveSearchParams();
  const { window } = useDashboardQuery() as {
    window: TimeWindow;
  };
  const searchParamsKey = searchParams.toString();
  const filters = useMemo(
    () => parseOverviewCardFilters(new URLSearchParams(searchParamsKey)),
    [searchParamsKey],
  );
  const [summary, setSummary] = useState<EventsSummaryData>(() =>
    emptySummary(),
  );
  const [trend, setTrend] = useState<EventsTrendData>(() =>
    emptyTrend(window.interval),
  );
  const [loading, setLoading] = useState(true);

  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      fetchEventsSummary(siteId, window, filters),
      fetchEventsTrend(siteId, window, filters, { limit: 8 }),
    ])
      .then(([nextSummary, nextTrend]) => {
        if (!active) return;
        setSummary(nextSummary);
        setTrend(nextTrend);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    filters,
    filtersKey,
    siteId,
    window.from,
    window.interval,
    window.timeZone,
    window.to,
  ]);

  const buildEventTypeHref = useCallback(
    (eventName: string) => {
      const params = new URLSearchParams(searchParamsKey);
      params.delete("eventName");
      const normalized = eventName.trim();
      if (!normalized) return null;
      params.set("eventName", normalized);
      return `${pathname}/detail?${params.toString()}`;
    },
    [pathname, searchParamsKey],
  );
  const openEventType = (eventName: string) => {
    const href = buildEventTypeHref(eventName);
    if (!href) return;
    navigateWithTransition(router, href);
  };
  const siteBasePath = useMemo(
    () => pathname.replace(/\/events$/, ""),
    [pathname],
  );
  const eventCardDataOverride = useMemo<OverviewPagesSectionCardData>(
    () => buildEventCardDataOverride(summary.cards.event.name),
    [summary.cards.event.name],
  );
  const contextCardDataOverride = useMemo<OverviewPagesSectionCardData>(
    () => buildContextCardDataOverride(summary.cards.page),
    [summary.cards.page],
  );

  return (
    <div className="space-y-6">
      <EventPageHeader
        messages={messages}
        title={messages.events.title}
        subtitle={messages.events.subtitle}
      />

      <EventMetricGrid
        locale={locale}
        labels={labels}
        summary={summary.summary}
      />

      <EventTrendStackedBarCard
        locale={locale}
        labels={labels}
        trend={trend}
        window={window}
        title={labels.trendTitle}
        loading={loading}
        onSelectEvent={openEventType}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <OverviewPagesSection
          locale={locale}
          messages={messages}
          siteId={siteId}
          siteDomain={siteDomain}
          pathname={pathname}
          filters={filters}
          cardDataOverride={eventCardDataOverride}
          visibleCards={["page"]}
          pageCardTabs={["path"]}
          pageCardTabMetaOverride={{
            path: {
              label: labels.topEvents,
              columnLabel: labels.eventName,
              primaryMetricLabel: labels.totalEvents,
              mono: false,
              showIcon: false,
            },
          }}
          pageCardQueryParamOverride={{ path: null }}
          pageCardNavigableTabs={[]}
          pageCardDetailTabs={["path"]}
          pageCardDetailHrefResolvers={{
            path: ({ value }) => buildEventTypeHref(value),
          }}
          pageCardShowVisitors
          primaryMetricLabel={labels.totalEvents}
          sectionClassName="xl:grid-cols-1"
        />

        <OverviewPagesSection
          locale={locale}
          messages={messages}
          siteId={siteId}
          siteDomain={siteDomain}
          pathname={siteBasePath}
          filters={filters}
          cardDataOverride={contextCardDataOverride}
          visibleCards={["page"]}
          pageCardTabs={["path", "title", "hostname"]}
          primaryMetricLabel={labels.totalEvents}
          sectionClassName="xl:grid-cols-1"
        />
      </div>

      <EventRecordsSection
        locale={locale}
        messages={messages}
        labels={labels}
        siteId={siteId}
        pathname={pathname}
        window={window}
        filters={filters}
      />
    </div>
  );
}
