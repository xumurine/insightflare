"use client";

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  RiArrowDownSLine,
  RiArrowRightUpLine,
  RiArrowUpSLine,
  RiSearchLine,
  RiShareForwardLine,
} from "@remixicon/react";
import { AnimatePresence, useReducedMotion } from "motion/react";

import { AnimatedDataTableRow } from "@/components/dashboard/animated-data-table-row";
import { DataTableSwitch } from "@/components/dashboard/data-table-switch";
import {
  LabelWithOptionalIcon,
  REFERRER_QUERY_PARAM_BY_TAB,
  type ReferrerRowsByTab,
  type ReferrerTab,
} from "@/components/dashboard/referrer-utils";
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
import {
  replaceUrlWithoutNavigation,
  useLiveSearchParams,
} from "@/lib/client-history";
import { numberFormat } from "@/lib/dashboard/format";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { formatI18nTemplate } from "@/lib/i18n/template";
import { cn } from "@/lib/utils";

type ReferrerSortKey = "views" | "visitors";
type ReferrerSortState = {
  key: ReferrerSortKey;
  direction: "asc" | "desc";
};

interface ReferrerBreakdownCardProps {
  locale: Locale;
  messages: AppMessages;
  pathname: string;
  rowsByTab: ReferrerRowsByTab;
  loading: boolean;
}

const DEFAULT_SORT: ReferrerSortState = {
  key: "views",
  direction: "desc",
};

function createInitialSortByTab(): Record<ReferrerTab, ReferrerSortState> {
  return {
    domain: { ...DEFAULT_SORT },
    link: { ...DEFAULT_SORT },
  };
}

export function ReferrerBreakdownCard({
  locale,
  messages,
  pathname,
  rowsByTab,
  loading,
}: ReferrerBreakdownCardProps) {
  const searchParams = useLiveSearchParams();
  const livePathname = usePathname() || pathname;
  const isMobile = useIsMobile();
  const reduceDataRowMotion = useReducedMotion() ?? false;
  const [sortByTab, setSortByTab] = useState<
    Record<ReferrerTab, ReferrerSortState>
  >(createInitialSortByTab);
  const [searchTab, setSearchTab] = useState<ReferrerTab | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!searchTab) {
      setSearchTerm("");
    }
  }, [searchTab]);

  const tabMeta: Record<
    ReferrerTab,
    { label: string; columnLabel: string; showIcon: boolean }
  > = {
    domain: {
      label: messages.overview.sourceTab,
      columnLabel: messages.overview.sourceDomainColumn,
      showIcon: true,
    },
    link: {
      label: messages.overview.sourceLinkTab,
      columnLabel: messages.overview.sourceLinkColumn,
      showIcon: true,
    },
  };

  const activeQueryValueByTab = useMemo(
    () => ({
      domain: normalizeQueryValue(
        searchParams.get(REFERRER_QUERY_PARAM_BY_TAB.domain),
      ),
      link: normalizeQueryValue(
        searchParams.get(REFERRER_QUERY_PARAM_BY_TAB.link),
      ),
    }),
    [searchParams],
  );

  const sortedRowsByTab = useMemo(() => {
    const next = {} as ReferrerRowsByTab;

    for (const tab of ["domain", "link"] as const) {
      const sort = sortByTab[tab];
      const direction = sort.direction === "asc" ? 1 : -1;
      next[tab] = [...rowsByTab[tab]].sort((left, right) => {
        const primary = (left[sort.key] - right[sort.key]) * direction;
        if (primary !== 0) return primary;
        if (right.views !== left.views) return right.views - left.views;
        if (right.visitors !== left.visitors)
          return right.visitors - left.visitors;
        return (left.displayLabel ?? left.label).localeCompare(
          right.displayLabel ?? right.label,
        );
      });
    }

    return next;
  }, [rowsByTab, sortByTab]);

  const visibleRowsByTab = useMemo(() => {
    const next = {} as ReferrerRowsByTab;

    for (const tab of ["domain", "link"] as const) {
      const activeQueryValue = activeQueryValueByTab[tab];
      next[tab] = activeQueryValue
        ? sortedRowsByTab[tab].filter(
            (row) => row.filterValue === activeQueryValue,
          )
        : sortedRowsByTab[tab];
    }

    return next;
  }, [activeQueryValueByTab, sortedRowsByTab]);

  const progressTotalByTab = useMemo(() => {
    const next = {} as Record<ReferrerTab, number>;

    for (const tab of ["domain", "link"] as const) {
      const sort = sortByTab[tab];
      next[tab] = sortedRowsByTab[tab].reduce(
        (sum, row) => sum + Math.max(0, Number(row[sort.key] ?? 0)),
        0,
      );
    }

    return next;
  }, [sortByTab, sortedRowsByTab]);

  const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase();
  const activeSearchTab = searchTab ?? "domain";
  const activeSearchRows = sortedRowsByTab[activeSearchTab];
  const searchedRows = useMemo(() => {
    if (!normalizedSearchTerm) return activeSearchRows;
    return activeSearchRows.filter((row) => {
      const displayLabel = row.displayLabel ?? row.label;
      return (
        displayLabel.toLocaleLowerCase().includes(normalizedSearchTerm) ||
        row.label.toLocaleLowerCase().includes(normalizedSearchTerm)
      );
    });
  }, [activeSearchRows, normalizedSearchTerm]);

  const searchPlaceholder = formatI18nTemplate(messages.overview.searchInTab, {
    tab: tabMeta[activeSearchTab].label,
  });

  function setQueryFilter(next: { tab: ReferrerTab; value: string } | null) {
    const params = new URLSearchParams(searchParams.toString());
    const activeTab = next?.tab ?? "domain";
    const queryKey = REFERRER_QUERY_PARAM_BY_TAB[activeTab];
    params.delete(queryKey);

    if (next) {
      const normalized = next.value.trim();
      if (normalized) {
        params.set(queryKey, normalized);
      }
    }

    const updated = params.toString();
    const current = searchParams.toString();
    if (updated === current) return;
    const target = updated ? `${livePathname}?${updated}` : livePathname;
    replaceUrlWithoutNavigation(target);
  }

  function toggleRowFilter(tab: ReferrerTab, value: string) {
    const normalized = value.trim();
    const isActive = activeQueryValueByTab[tab] === normalized;
    setQueryFilter(isActive ? null : { tab, value: normalized });
  }

  function toggleSort(tab: ReferrerTab, key: ReferrerSortKey) {
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

  function openTarget(targetUrl: string, event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
    globalThis.window.open(targetUrl, "_blank", "noopener,noreferrer");
  }

  function renderSortIndicator(tab: ReferrerTab, key: ReferrerSortKey) {
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

  function renderTableHeader(tab: ReferrerTab) {
    const sort = sortByTab[tab];
    const meta = tabMeta[tab];

    return (
      <TableRow className="hover:bg-transparent">
        <TableHead className="h-8 p-0">
          <div className="px-4">{meta.columnLabel}</div>
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
        <TableHead className="h-8 w-20 p-0">
          <div className="flex justify-end px-2">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap transition-colors",
                sort.key === "visitors"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => toggleSort(tab, "visitors")}
            >
              {messages.common.visitors}
              {renderSortIndicator(tab, "visitors")}
            </button>
          </div>
        </TableHead>
      </TableRow>
    );
  }

  function renderRows(
    tab: ReferrerTab,
    rows: ReferrerRowsByTab[ReferrerTab],
    contentKeyPrefix: string,
  ) {
    const sort = sortByTab[tab];
    const progressTotal = progressTotalByTab[tab];
    const activeQueryValue = activeQueryValueByTab[tab];
    const meta = tabMeta[tab];

    return (
      <AnimatePresence initial={false} mode="popLayout">
        {rows.map((row) => {
          const displayLabel = row.displayLabel ?? row.label;
          const rowValue = Math.max(0, Number(row[sort.key] ?? 0));
          const progressPercent =
            progressTotal > 0
              ? Math.min(100, (rowValue / progressTotal) * 100)
              : 0;
          const rowActive = activeQueryValue === row.filterValue;

          return (
            <AnimatedDataTableRow
              key={`${contentKeyPrefix}-${row.key}`}
              reduceMotion={reduceDataRowMotion}
              className={cn(
                "group/row cursor-pointer bg-no-repeat transition-[background-size,filter] duration-300 ease-out hover:bg-transparent hover:brightness-95",
                rowActive && "brightness-95",
              )}
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--muted) 0%, var(--muted) 100%)",
                backgroundSize: `${progressPercent.toFixed(2)}% 100%`,
                backgroundPosition: "left top",
              }}
              onClick={() => toggleRowFilter(tab, row.filterValue)}
            >
              <TableCell className="whitespace-normal p-0 align-top">
                <div
                  className={cn(
                    "px-4 py-2 leading-5 whitespace-normal break-words",
                    row.mono && "font-mono",
                  )}
                >
                  <span className="inline-flex items-center gap-2 break-words">
                    <LabelWithOptionalIcon
                      label={displayLabel}
                      showIcon={meta.showIcon}
                      unknownLabel={messages.overview.direct}
                    />
                    {row.targetUrl ? (
                      <Clickable
                        className="inline-flex text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-foreground"
                        onClick={(event) => openTarget(row.targetUrl!, event)}
                        aria-label={displayLabel}
                        title={displayLabel}
                      >
                        <RiArrowRightUpLine size="1.4em" />
                      </Clickable>
                    ) : null}
                  </span>
                </div>
              </TableCell>
              <TableCell className="p-0">
                <div className="px-2 py-2 text-right">
                  {numberFormat(locale, row.views)}
                </div>
              </TableCell>
              <TableCell className="p-0">
                <div className="px-4 py-2 text-right">
                  {numberFormat(locale, row.visitors)}
                </div>
              </TableCell>
            </AnimatedDataTableRow>
          );
        })}
      </AnimatePresence>
    );
  }

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
            searchedRows,
            `search-${activeSearchTab}`,
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
          <DialogTitle icon={RiSearchLine}>{searchPlaceholder}</DialogTitle>
        </DialogHeader>
        {searchContent}
      </DialogContent>
    </Dialog>
  );

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="inline-flex items-center gap-2 text-sm font-medium tracking-tight">
          <RiShareForwardLine className="size-4 shrink-0" />
          {messages.referrers.breakdownTitle}
        </h2>
      </div>

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        {(["domain", "link"] as const).map((tab) => {
          const rows = sortedRowsByTab[tab];
          const visibleRows = visibleRowsByTab[tab];

          return (
            <div key={tab} className="min-w-0 h-full">
              <TabbedScrollMaskCard
                value={tab}
                onValueChange={() => {}}
                tabs={[{ value: tab, label: tabMeta[tab].label }]}
                headerRight={
                  <Clickable
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearchTab(tab)}
                    aria-label={messages.common.search}
                    title={messages.common.search}
                  >
                    <RiSearchLine className="size-4" />
                  </Clickable>
                }
                className="h-full min-h-[420px]"
                syncKey={`${loading}-${tab}-${sortByTab[tab].key}-${sortByTab[tab].direction}-${rows.length}-${activeQueryValueByTab[tab] ?? "all"}-${visibleRows.length}`}
              >
                <DataTableSwitch
                  loading={loading}
                  hasContent={visibleRows.length > 0}
                  loadingLabel={messages.common.loading}
                  emptyLabel={messages.common.noData}
                  colSpan={3}
                  header={renderTableHeader(tab)}
                  rows={renderRows(tab, visibleRows, `main-${tab}`)}
                  contentKey={`${tab}-${activeQueryValueByTab[tab] ?? "all"}`}
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

function normalizeQueryValue(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
