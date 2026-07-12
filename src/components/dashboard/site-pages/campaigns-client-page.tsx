import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

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
const EMPTY_ROWS_BY_TAB: CampaignRawRowsByTab = {
  source: EMPTY_ROWS,
  medium: EMPTY_ROWS,
  campaign: EMPTY_ROWS,
  term: EMPTY_ROWS,
  content: EMPTY_ROWS,
};

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

function emptyRowsUnlessAborted(
  error: unknown,
): CampaignRawRowsByTab["source"] {
  if (error instanceof Error && error.name === "AbortError") throw error;
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

  const { data: rowsByTab, isFetching: loading } = useQuery({
    queryKey: [
      "dashboard",
      "campaign-breakdown",
      siteId,
      window.from,
      window.to,
      window.interval,
      window.timeZone,
      filtersKey,
    ],
    queryFn: async ({ signal }) => {
      const loadDimension = (tab: keyof CampaignRawRowsByTab) =>
        fetchUtmDimension(siteId, requestWindow, tab, requestFilters, {
          signal,
        })
          .then((payload) => extractDimensionRows(payload))
          .catch(emptyRowsUnlessAborted);
      const [source, medium, campaign, term, content] = await Promise.all([
        loadDimension("source"),
        loadDimension("medium"),
        loadDimension("campaign"),
        loadDimension("term"),
        loadDimension("content"),
      ]);
      return { source, medium, campaign, term, content };
    },
    enabled: typeof window !== "undefined",
  });
  const resolvedRowsByTab = rowsByTab ?? EMPTY_ROWS_BY_TAB;

  const normalizedRowsByTab = useMemo(
    () => buildCampaignRowsByTab(resolvedRowsByTab, messages.campaigns.notSet),
    [messages.campaigns.notSet, resolvedRowsByTab],
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
