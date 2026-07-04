"use client";

import { useMemo } from "react";
import { RiPriceTag3Line } from "@remixicon/react";

import {
  CAMPAIGN_TABS,
  type CampaignBreakdownRow,
  type CampaignRowsByTab,
  type CampaignTab,
} from "@/components/dashboard/campaign-utils";
import {
  TabbedDataTableCard,
  type TabbedDataTableColumn,
  type TabbedDataTableTab,
} from "@/components/dashboard/tabbed-data-table-card";
import { numberFormat } from "@/lib/dashboard/format";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { formatI18nTemplate } from "@/lib/i18n/template";
import { cn } from "@/lib/utils";

type CampaignSortKey = "views" | "sessions";
type CampaignBreakdownGroupKey = "acquisition" | "signals";

interface CampaignBreakdownCardProps {
  locale: Locale;
  messages: AppMessages;
  rowsByTab: CampaignRowsByTab;
  loading: boolean;
}

const CAMPAIGN_BREAKDOWN_GROUPS: Array<{
  key: CampaignBreakdownGroupKey;
  tabs: CampaignTab[];
}> = [
  {
    key: "acquisition",
    tabs: ["source", "medium", "campaign"],
  },
  {
    key: "signals",
    tabs: ["term", "content"],
  },
];

export function CampaignBreakdownCard({
  locale,
  messages,
  rowsByTab,
  loading,
}: CampaignBreakdownCardProps) {
  const tabMeta = useMemo<Record<CampaignTab, TabbedDataTableTab<CampaignTab>>>(
    () => ({
      source: {
        value: "source",
        label: messages.campaigns.tabSource,
        columnLabel: messages.campaigns.tabSource,
      },
      medium: {
        value: "medium",
        label: messages.campaigns.tabMedium,
        columnLabel: messages.campaigns.tabMedium,
      },
      campaign: {
        value: "campaign",
        label: messages.campaigns.tabCampaign,
        columnLabel: messages.campaigns.tabCampaign,
      },
      term: {
        value: "term",
        label: messages.campaigns.tabTerm,
        columnLabel: messages.campaigns.tabTerm,
      },
      content: {
        value: "content",
        label: messages.campaigns.tabContent,
        columnLabel: messages.campaigns.tabContent,
      },
    }),
    [
      messages.campaigns.tabCampaign,
      messages.campaigns.tabContent,
      messages.campaigns.tabMedium,
      messages.campaigns.tabSource,
      messages.campaigns.tabTerm,
    ],
  );
  const columns = useMemo<
    readonly TabbedDataTableColumn<
      CampaignBreakdownRow,
      CampaignSortKey,
      CampaignTab
    >[]
  >(
    () => [
      {
        key: "views",
        label: messages.common.views,
        getValue: (row) => row.views,
        format: (value) => numberFormat(locale, value),
      },
      {
        key: "sessions",
        label: messages.common.sessions,
        getValue: (row) => row.sessions,
        format: (value) => numberFormat(locale, value),
      },
    ],
    [locale, messages.common.sessions, messages.common.views],
  );
  const loadingByTab = useMemo(
    () =>
      CAMPAIGN_TABS.reduce(
        (acc, tab) => {
          acc[tab] = loading;
          return acc;
        },
        {} as Record<CampaignTab, boolean>,
      ),
    [loading],
  );

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="inline-flex items-center gap-2 text-sm font-medium tracking-tight">
          <RiPriceTag3Line className="size-4 shrink-0" />
          {messages.campaigns.breakdownTitle}
        </h2>
      </div>

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        {CAMPAIGN_BREAKDOWN_GROUPS.map((group) => {
          const groupTabs = group.tabs.map((tab) => tabMeta[tab]) as [
            TabbedDataTableTab<CampaignTab>,
            ...TabbedDataTableTab<CampaignTab>[],
          ];

          return (
            <div key={group.key} className="h-full min-w-0">
              <TabbedDataTableCard<
                CampaignTab,
                CampaignBreakdownRow,
                CampaignSortKey
              >
                tabs={groupTabs}
                rowsByTab={rowsByTab}
                loadingByTab={loadingByTab}
                columns={columns}
                renderLabel={(row) => (
                  <span className={cn("break-words", row.mono && "font-mono")}>
                    {row.label}
                  </span>
                )}
                getRowSearchText={(row) => row.label}
                compareRows={(left, right, { sort }) => {
                  const primary =
                    (left[sort.key] - right[sort.key]) *
                    (sort.direction === "asc" ? 1 : -1);
                  if (primary !== 0) return primary;
                  if (right.views !== left.views)
                    return right.views - left.views;
                  if (right.sessions !== left.sessions) {
                    return right.sessions - left.sessions;
                  }
                  return left.label.localeCompare(right.label);
                }}
                loadingLabel={messages.common.loading}
                emptyLabel={messages.campaigns.noTaggedTraffic}
                className="h-full min-h-[420px]"
                search={{
                  actionLabel: messages.common.search,
                  placeholder: (tab) =>
                    formatI18nTemplate(messages.overview.searchInTab, {
                      tab: tab.label,
                    }),
                }}
                getRowClassName={() => "hover:brightness-95"}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
