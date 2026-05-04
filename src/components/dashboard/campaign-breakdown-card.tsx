"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiSearchLine,
} from "@remixicon/react";
import { AnimatePresence, useReducedMotion } from "motion/react";

import { AnimatedDataTableRow } from "@/components/dashboard/animated-data-table-row";
import {
  CAMPAIGN_TABS,
  type CampaignRowsByTab,
  type CampaignTab,
} from "@/components/dashboard/campaign-utils";
import { DataTableSwitch } from "@/components/dashboard/data-table-switch";
import { TabbedScrollMaskCard } from "@/components/dashboard/tabbed-scroll-mask-card";
import { Clickable } from "@/components/ui/clickable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { numberFormat } from "@/lib/dashboard/format";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { formatI18nTemplate } from "@/lib/i18n/template";
import { cn } from "@/lib/utils";

type CampaignSortKey = "views" | "sessions";
type CampaignSortState = {
  key: CampaignSortKey;
  direction: "asc" | "desc";
};
type CampaignBreakdownGroupKey = "acquisition" | "signals";

interface CampaignBreakdownCardProps {
  locale: Locale;
  messages: AppMessages;
  rowsByTab: CampaignRowsByTab;
  loading: boolean;
}

const DEFAULT_SORT: CampaignSortState = {
  key: "views",
  direction: "desc",
};
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

function createInitialSortByTab(): Record<CampaignTab, CampaignSortState> {
  return {
    source: { ...DEFAULT_SORT },
    medium: { ...DEFAULT_SORT },
    campaign: { ...DEFAULT_SORT },
    term: { ...DEFAULT_SORT },
    content: { ...DEFAULT_SORT },
  };
}

function createInitialActiveTabByGroup(): Record<
  CampaignBreakdownGroupKey,
  CampaignTab
> {
  return {
    acquisition: "source",
    signals: "term",
  };
}

export function CampaignBreakdownCard({
  locale,
  messages,
  rowsByTab,
  loading,
}: CampaignBreakdownCardProps) {
  const isMobile = useIsMobile();
  const reduceDataRowMotion = useReducedMotion() ?? false;
  const [sortByTab, setSortByTab] = useState<
    Record<CampaignTab, CampaignSortState>
  >(createInitialSortByTab);
  const [activeTabByGroup, setActiveTabByGroup] = useState<
    Record<CampaignBreakdownGroupKey, CampaignTab>
  >(createInitialActiveTabByGroup);
  const [searchTab, setSearchTab] = useState<CampaignTab | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!searchTab) {
      setSearchTerm("");
    }
  }, [searchTab]);

  const tabMeta: Record<CampaignTab, { label: string }> = {
    source: { label: messages.campaigns.tabSource },
    medium: { label: messages.campaigns.tabMedium },
    campaign: { label: messages.campaigns.tabCampaign },
    term: { label: messages.campaigns.tabTerm },
    content: { label: messages.campaigns.tabContent },
  };
  const sortedRowsByTab = useMemo(() => {
    const next = {} as CampaignRowsByTab;

    for (const tab of CAMPAIGN_TABS) {
      const sort = sortByTab[tab];
      const direction = sort.direction === "asc" ? 1 : -1;
      next[tab] = [...rowsByTab[tab]].sort((left, right) => {
        const primary = (left[sort.key] - right[sort.key]) * direction;
        if (primary !== 0) return primary;
        if (right.views !== left.views) return right.views - left.views;
        if (right.sessions !== left.sessions) {
          return right.sessions - left.sessions;
        }
        return left.label.localeCompare(right.label);
      });
    }

    return next;
  }, [rowsByTab, sortByTab]);
  const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase();
  const activeSearchTab = searchTab ?? "source";
  const activeSearchMeta = tabMeta[activeSearchTab];
  const activeSearchRows = sortedRowsByTab[activeSearchTab];
  const searchedRows = useMemo(() => {
    if (!normalizedSearchTerm) return activeSearchRows;

    return activeSearchRows.filter((row) =>
      row.label.toLocaleLowerCase().includes(normalizedSearchTerm),
    );
  }, [activeSearchRows, normalizedSearchTerm]);
  const progressTotalByTab = useMemo(() => {
    const next = {} as Record<CampaignTab, number>;

    for (const tab of CAMPAIGN_TABS) {
      const sort = sortByTab[tab];
      next[tab] = sortedRowsByTab[tab].reduce(
        (sum, row) => sum + Math.max(0, Number(row[sort.key] ?? 0)),
        0,
      );
    }

    return next;
  }, [sortedRowsByTab, sortByTab]);
  const searchPlaceholder = formatI18nTemplate(messages.overview.searchInTab, {
    tab: activeSearchMeta.label,
  });

  function toggleSort(tab: CampaignTab, key: CampaignSortKey) {
    setSortByTab((previous) => {
      const current = previous[tab];
      return {
        ...previous,
        [tab]:
          current.key === key
            ? {
                key,
                direction: current.direction === "desc" ? "asc" : "desc",
              }
            : { key, direction: "desc" },
      };
    });
  }

  function renderSortIndicator(tab: CampaignTab, key: CampaignSortKey) {
    const sort = sortByTab[tab];
    if (sort.key === key) {
      return sort.direction === "desc" ? (
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

  function renderTableHeader(tab: CampaignTab) {
    const sort = sortByTab[tab];

    return (
      <TableRow className="hover:bg-transparent">
        <TableHead className="h-8 p-0">
          <div className="px-4">{tabMeta[tab].label}</div>
        </TableHead>
        <TableHead className="h-8 w-20 p-0">
          <div className="flex justify-end px-2">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap transition-colors",
                sort.key === "views"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => toggleSort(tab, "views")}
            >
              {messages.common.views}
              {renderSortIndicator(tab, "views")}
            </button>
          </div>
        </TableHead>
        <TableHead className="h-8 w-24 p-0">
          <div className="flex justify-end px-2">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap transition-colors",
                sort.key === "sessions"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => toggleSort(tab, "sessions")}
            >
              {messages.common.sessions}
              {renderSortIndicator(tab, "sessions")}
            </button>
          </div>
        </TableHead>
      </TableRow>
    );
  }

  const renderRows = (
    tab: CampaignTab,
    contentKeyPrefix: string,
    rows = sortedRowsByTab[tab],
  ) => {
    const sort = sortByTab[tab];

    return (
      <AnimatePresence initial={false} mode="popLayout">
        {rows.map((row) => {
          const rowValue = Math.max(0, Number(row[sort.key] ?? 0));
          const progressPercent =
            progressTotalByTab[tab] > 0
              ? Math.min(100, (rowValue / progressTotalByTab[tab]) * 100)
              : 0;

          return (
            <AnimatedDataTableRow
              key={`${contentKeyPrefix}-${row.key}`}
              reduceMotion={reduceDataRowMotion}
              className="bg-no-repeat transition-[background-size,filter] duration-300 ease-out hover:bg-transparent hover:brightness-95"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--muted) 0%, var(--muted) 100%)",
                backgroundSize: `${progressPercent.toFixed(2)}% 100%`,
                backgroundPosition: "left top",
              }}
            >
              <TableCell className="whitespace-normal p-0 align-top">
                <div
                  className={cn(
                    "px-4 py-2 leading-5 whitespace-normal break-words",
                    row.mono && "font-mono",
                  )}
                >
                  {row.label}
                </div>
              </TableCell>
              <TableCell className="p-0">
                <div className="px-2 py-2 text-right">
                  {numberFormat(locale, row.views)}
                </div>
              </TableCell>
              <TableCell className="p-0">
                <div className="px-4 py-2 text-right">
                  {numberFormat(locale, row.sessions)}
                </div>
              </TableCell>
            </AnimatedDataTableRow>
          );
        })}
      </AnimatePresence>
    );
  };

  const searchContent = (
    <div className="space-y-3">
      <Input
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder={searchPlaceholder}
      />
      <div className="max-h-[60vh] overflow-auto pr-1">
        <DataTableSwitch
          loading={loading}
          hasContent={searchedRows.length > 0}
          loadingLabel={messages.common.loading}
          emptyLabel={messages.common.noData}
          colSpan={3}
          header={renderTableHeader(activeSearchTab)}
          rows={renderRows(
            activeSearchTab,
            `search-${activeSearchTab}`,
            searchedRows,
          )}
          contentKey={`search-${activeSearchTab}-${searchTerm}-${searchedRows.length}`}
        />
      </div>
    </div>
  );

  const searchPanel = isMobile ? (
    <Drawer
      open={searchTab !== null}
      onOpenChange={(open) => {
        if (!open) setSearchTab(null);
      }}
    >
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>{searchPlaceholder}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4">{searchContent}</div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog
      open={searchTab !== null}
      onOpenChange={(open) => {
        if (!open) setSearchTab(null);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{searchPlaceholder}</DialogTitle>
        </DialogHeader>
        {searchContent}
      </DialogContent>
    </Dialog>
  );

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-medium tracking-tight">
          {messages.campaigns.breakdownTitle}
        </h2>
      </div>

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        {CAMPAIGN_BREAKDOWN_GROUPS.map((group) => {
          const activeTab = activeTabByGroup[group.key];
          const rows = sortedRowsByTab[activeTab];

          return (
            <div key={group.key} className="h-full min-w-0">
              <TabbedScrollMaskCard<CampaignTab>
                value={activeTab}
                onValueChange={(value) =>
                  setActiveTabByGroup((previous) => ({
                    ...previous,
                    [group.key]: value,
                  }))
                }
                tabs={group.tabs.map((tab) => ({
                  value: tab,
                  label: tabMeta[tab].label,
                }))}
                headerRight={
                  <Clickable
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearchTab(activeTab)}
                    aria-label={messages.common.search}
                    title={messages.common.search}
                  >
                    <RiSearchLine className="size-4" />
                  </Clickable>
                }
                className="h-full min-h-[420px]"
                syncKey={`${loading}-${activeTab}-${sortByTab[activeTab].key}-${sortByTab[activeTab].direction}-${rows.length}`}
              >
                <DataTableSwitch
                  loading={loading}
                  hasContent={rows.length > 0}
                  loadingLabel={messages.common.loading}
                  emptyLabel={messages.campaigns.noTaggedTraffic}
                  colSpan={3}
                  header={renderTableHeader(activeTab)}
                  rows={renderRows(activeTab, `main-${activeTab}`)}
                  contentKey={activeTab}
                />
              </TabbedScrollMaskCard>
            </div>
          );
        })}
      </div>

      {searchPanel}
    </section>
  );
}
