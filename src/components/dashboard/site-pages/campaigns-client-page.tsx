import { useEffect, useMemo, useState } from "react";

import { CampaignBreakdownCard } from "@/components/dashboard/campaign-breakdown-card";
import { CampaignShareTrendCard } from "@/components/dashboard/campaign-share-trend-card";
import {
  buildCampaignRowsByTab,
  type CampaignRawRowsByTab,
} from "@/components/dashboard/campaign-utils";
import { PageHeading } from "@/components/dashboard/page-heading";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";
import { fetchUtmDimension } from "@/lib/dashboard/client-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface CampaignsClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

const EMPTY_ROWS: CampaignRawRowsByTab["source"] = [];

function extractDimensionRows(
  payload: unknown,
): CampaignRawRowsByTab["source"] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: CampaignRawRowsByTab["source"] }).data;
  }

  return EMPTY_ROWS;
}

export function CampaignsClientPage({
  locale,
  messages,
  siteId,
}: CampaignsClientPageProps) {
  const { filters, window } = useDashboardQuery() as {
    filters: DashboardFilters;
    window: TimeWindow;
  };
  const [loading, setLoading] = useState(true);
  const [rowsByTab, setRowsByTab] = useState<CampaignRawRowsByTab>({
    source: EMPTY_ROWS,
    medium: EMPTY_ROWS,
    campaign: EMPTY_ROWS,
    term: EMPTY_ROWS,
    content: EMPTY_ROWS,
  });
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

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      fetchUtmDimension(siteId, requestWindow, "source", requestFilters)
        .then((payload) => extractDimensionRows(payload))
        .catch(() => EMPTY_ROWS),
      fetchUtmDimension(siteId, requestWindow, "medium", requestFilters)
        .then((payload) => extractDimensionRows(payload))
        .catch(() => EMPTY_ROWS),
      fetchUtmDimension(siteId, requestWindow, "campaign", requestFilters)
        .then((payload) => extractDimensionRows(payload))
        .catch(() => EMPTY_ROWS),
      fetchUtmDimension(siteId, requestWindow, "term", requestFilters)
        .then((payload) => extractDimensionRows(payload))
        .catch(() => EMPTY_ROWS),
      fetchUtmDimension(siteId, requestWindow, "content", requestFilters)
        .then((payload) => extractDimensionRows(payload))
        .catch(() => EMPTY_ROWS),
    ])
      .then(([source, medium, campaign, term, content]) => {
        if (!active) return;
        setRowsByTab({
          source,
          medium,
          campaign,
          term,
          content,
        });
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
    () => buildCampaignRowsByTab(rowsByTab, messages.campaigns.notSet),
    [messages.campaigns.notSet, rowsByTab],
  );

  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.campaigns.title}
        subtitle={messages.campaigns.subtitle}
      />

      <CampaignShareTrendCard
        locale={locale}
        messages={messages}
        siteId={siteId}
        window={requestWindow}
        filters={requestFilters}
      />

      <CampaignBreakdownCard
        locale={locale}
        messages={messages}
        rowsByTab={normalizedRowsByTab}
        loading={loading}
      />
    </div>
  );
}
