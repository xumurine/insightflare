"use client";

import { useEffect, useMemo, useState } from "react";

import { useDetailModalClose } from "@/components/dashboard/site-pages/detail-query-modal";
import {
  EventFieldsCard,
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
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveSearchParams } from "@/lib/client-history";
import { fetchEventTypeDetail } from "@/lib/dashboard/client-data";
import type { TimeWindow } from "@/lib/dashboard/query-state";
import type { EventTypeDetailData } from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface EventTypeDetailClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  siteDomain: string;
  pathname: string;
  eventName: string;
}

function emptyEventTypeDetail(
  eventName: string,
  interval: TimeWindow["interval"],
): EventTypeDetailData {
  return {
    ok: true,
    eventName,
    summary: {
      events: 0,
      eventTypes: eventName ? 1 : 0,
      sessions: 0,
      visitors: 0,
      avgEventsPerSession: 0,
      shareOfAllEvents: 0,
    },
    trend: {
      series: [],
      data: [],
    },
    breakdowns: {
      pages: [],
      countries: [],
      devices: [],
      browsers: [],
    },
    cards: emptyDetailCards(),
    fields: [],
  };
}

function emptyDetailCards(): EventTypeDetailData["cards"] {
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

function DetailLoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-[420px] w-full" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-64 w-full" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

export function EventTypeDetailClientPage({
  locale,
  messages,
  siteId,
  siteDomain,
  pathname,
  eventName,
}: EventTypeDetailClientPageProps) {
  const modalClose = useDetailModalClose();
  const liveSearchParams = useLiveSearchParams();
  const labels = messages.events;
  const { window } = useDashboardQuery() as {
    window: TimeWindow;
  };
  const eventsPath = pathname.replace(/\/detail$/, "");
  const siteBasePath = eventsPath.replace(/\/events$/, "");
  const liveSearchParamsKey = liveSearchParams.toString();
  const filters = useMemo(
    () => parseOverviewCardFilters(new URLSearchParams(liveSearchParamsKey)),
    [liveSearchParamsKey],
  );
  const [detail, setDetail] = useState<EventTypeDetailData>(() =>
    emptyEventTypeDetail(eventName, window.interval),
  );
  const [loading, setLoading] = useState(Boolean(eventName));
  const [error, setError] = useState(false);

  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const requestFilters = useMemo(() => ({ ...filters }), [filtersKey]);
  const requestWindow = useMemo(
    () => ({
      preset: window.preset,
      from: window.from,
      to: window.to,
      interval: window.interval,
      timeZone: window.timeZone,
    }),
    [window.from, window.interval, window.preset, window.timeZone, window.to],
  );
  const requestKey = useMemo(
    () =>
      [
        siteId,
        eventName,
        requestWindow.from,
        requestWindow.to,
        requestWindow.interval,
        requestWindow.timeZone,
        filtersKey,
      ].join(":"),
    [
      eventName,
      filtersKey,
      requestWindow.from,
      requestWindow.interval,
      requestWindow.timeZone,
      requestWindow.to,
      siteId,
    ],
  );
  const contextCardDataOverride = useMemo<OverviewPagesSectionCardData>(
    () => ({
      page: detail.cards.page,
      source: detail.cards.source,
      client: detail.cards.client,
      geo: detail.cards.geo,
    }),
    [
      detail.cards.client,
      detail.cards.geo,
      detail.cards.page,
      detail.cards.source,
    ],
  );

  useEffect(() => {
    if (!eventName) {
      setDetail(emptyEventTypeDetail("", requestWindow.interval));
      setLoading(false);
      setError(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(false);
    fetchEventTypeDetail(siteId, requestWindow, eventName, requestFilters)
      .then((payload) => {
        if (!active) return;
        setDetail(payload);
      })
      .catch(() => {
        if (!active) return;
        setDetail(emptyEventTypeDetail(eventName, requestWindow.interval));
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventName, requestFilters, requestKey, requestWindow, siteId]);

  if (!eventName) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:p-6">
        <EventPageHeader
          messages={messages}
          title={messages.events.detailTitle}
          subtitle={messages.events.typeDetailSubtitle}
          backHref={eventsPath}
          backLabel={messages.events.backToEvents}
          onBack={modalClose ?? undefined}
        />
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {messages.events.noEventName}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:p-6">
      <EventPageHeader
        messages={messages}
        title={eventName}
        subtitle={messages.events.typeDetailSubtitle}
        backHref={eventsPath}
        backLabel={messages.events.backToEvents}
        onBack={modalClose ?? undefined}
      />

      {loading && detail.summary.events === 0 ? (
        <DetailLoadingState />
      ) : (
        <>
          {error ? (
            <Card>
              <CardContent className="py-4 text-sm text-muted-foreground">
                {messages.events.loadError}
              </CardContent>
            </Card>
          ) : null}

          <EventMetricGrid
            locale={locale}
            labels={labels}
            summary={detail.summary}
            includeShare
          />

          <EventTrendStackedBarCard
            locale={locale}
            labels={labels}
            trend={detail.trend}
            window={requestWindow}
            title={messages.events.trendTitle}
            loading={loading}
          />

          <OverviewPagesSection
            locale={locale}
            messages={messages}
            siteId={siteId}
            siteDomain={siteDomain}
            pathname={siteBasePath}
            filters={requestFilters}
            cardDataOverride={contextCardDataOverride}
            primaryMetricLabel={labels.totalEvents}
            geoPageBasePathname={siteBasePath}
          />

          <EventFieldsCard
            locale={locale}
            labels={labels}
            fields={detail.fields}
          />

          <EventRecordsSection
            locale={locale}
            messages={messages}
            labels={labels}
            siteId={siteId}
            pathname={eventsPath}
            window={requestWindow}
            filters={requestFilters}
            eventName={eventName}
          />
        </>
      )}
    </div>
  );
}
