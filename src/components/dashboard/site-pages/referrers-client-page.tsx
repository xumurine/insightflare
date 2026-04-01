"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { ReferrerBreakdownCard } from "@/components/dashboard/referrer-breakdown-card";
import { ReferrerPerformanceRadarCard } from "@/components/dashboard/referrer-performance-radar-card";
import { ReferrerShareTrendCard } from "@/components/dashboard/referrer-share-trend-card";
import { ReferrerSummarySection } from "@/components/dashboard/referrer-summary-section";
import { buildReferrerRowsByTab } from "@/components/dashboard/referrer-utils";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";
import { fetchOverviewSourceCardTab, type OverviewTabRows } from "@/lib/dashboard/client-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface ReferrersClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

const EMPTY_ROWS: OverviewTabRows = [];

export function ReferrersClientPage({
  locale,
  messages,
  siteId,
  pathname,
}: ReferrersClientPageProps) {
  const { filters, window } = useDashboardQuery() as {
    filters: DashboardFilters;
    window: TimeWindow;
  };
  const [loading, setLoading] = useState(true);
  const [rowsByTab, setRowsByTab] = useState<{
    domain: OverviewTabRows;
    link: OverviewTabRows;
  }>({
    domain: EMPTY_ROWS,
    link: EMPTY_ROWS,
  });
  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const requestFilters = useMemo(() => ({ ...filters }), [filtersKey]);
  const requestWindow = useMemo(
    () => ({
      preset: window.preset,
      from: window.from,
      to: window.to,
      interval: window.interval,
    }),
    [window.from, window.interval, window.preset, window.to],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      fetchOverviewSourceCardTab(siteId, requestWindow, "domain", requestFilters, {
        limit: 100,
      }).catch(() => EMPTY_ROWS),
      fetchOverviewSourceCardTab(siteId, requestWindow, "link", requestFilters, {
        limit: 100,
      }).catch(() => EMPTY_ROWS),
    ])
      .then(([domain, link]) => {
        if (!active) return;
        setRowsByTab({ domain, link });
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [requestFilters, requestWindow, siteId]);

  const normalizedRowsByTab = useMemo(
    () => buildReferrerRowsByTab(rowsByTab, messages.overview.direct),
    [messages.overview.direct, rowsByTab],
  );

  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.referrers.title}
        subtitle={messages.referrers.subtitle}
      />

      <ReferrerSummarySection
        locale={locale}
        messages={messages}
        rowsByTab={normalizedRowsByTab}
        loading={loading}
        hideSummaryCard
      />

      <ReferrerShareTrendCard
        locale={locale}
        messages={messages}
        siteId={siteId}
        window={requestWindow}
        filters={requestFilters}
      />

      <ReferrerPerformanceRadarCard
        locale={locale}
        messages={messages}
        siteId={siteId}
        window={requestWindow}
        filters={requestFilters}
      />

      <ReferrerBreakdownCard
        locale={locale}
        messages={messages}
        pathname={pathname}
        rowsByTab={normalizedRowsByTab}
        loading={loading}
      />
    </div>
  );
}
