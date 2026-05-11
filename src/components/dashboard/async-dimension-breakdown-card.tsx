"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiSearchLine,
} from "@remixicon/react";
import { AnimatePresence, useReducedMotion } from "motion/react";

import { AnimatedDataTableRow } from "@/components/dashboard/animated-data-table-row";
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

type NonEmptyArray<T> = readonly [T, ...T[]];
type SortKey = "views" | "visitors";
type SortState = {
  key: SortKey;
  direction: "asc" | "desc";
};

const DEFAULT_SORT: SortState = {
  key: "views",
  direction: "desc",
};

export interface AsyncDimensionBreakdownRow {
  key: string;
  label: string;
  views: number;
  visitors: number;
  mono?: boolean;
}

export interface AsyncDimensionBreakdownTab<T extends string = string> {
  value: T;
  label: string;
  columnLabel?: string;
  primaryMetricLabel?: string;
}

interface AsyncDimensionBreakdownCardProps<T extends string> {
  locale: Locale;
  messages: AppMessages;
  tabs: NonEmptyArray<AsyncDimensionBreakdownTab<T>>;
  loadRows: (tab: T) => Promise<AsyncDimensionBreakdownRow[]>;
  requestKey: string;
  className?: string;
  showVisitors?: boolean;
  emptyLabel?: string;
}

function createRecord<T extends string, TValue>(
  tabs: readonly AsyncDimensionBreakdownTab<T>[],
  createValue: () => TValue,
): Record<T, TValue> {
  return tabs.reduce(
    (acc, tab) => {
      acc[tab.value] = createValue();
      return acc;
    },
    {} as Record<T, TValue>,
  );
}

function normalizeRows(
  rows: AsyncDimensionBreakdownRow[],
): AsyncDimensionBreakdownRow[] {
  return rows.map((row, index) => ({
    ...row,
    key: row.key || `${row.label}-${index}`,
    label: String(row.label ?? "").trim(),
    views: Math.max(0, Number(row.views ?? 0)),
    visitors: Math.max(0, Number(row.visitors ?? 0)),
    mono: Boolean(row.mono),
  }));
}

export function AsyncDimensionBreakdownCard<T extends string>({
  locale,
  messages,
  tabs,
  loadRows,
  requestKey,
  className,
  showVisitors = true,
  emptyLabel,
}: AsyncDimensionBreakdownCardProps<T>) {
  const isMobile = useIsMobile();
  const reduceDataRowMotion = useReducedMotion() ?? false;
  const [activeTab, setActiveTab] = useState<T>(tabs[0].value);
  const [rowsByTab, setRowsByTab] = useState<
    Record<T, AsyncDimensionBreakdownRow[] | null>
  >(() => createRecord(tabs, () => null));
  const [loadingByTab, setLoadingByTab] = useState<Record<T, boolean>>(() =>
    createRecord(tabs, () => false),
  );
  const [sortByTab, setSortByTab] = useState<Record<T, SortState>>(() =>
    createRecord(tabs, () => ({ ...DEFAULT_SORT })),
  );
  const [searchTab, setSearchTab] = useState<T | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const latestLoadRowsRef = useRef(loadRows);

  const activeRows = rowsByTab[activeTab];
  const isActiveTabLoading = loadingByTab[activeTab];
  const activeLoading = isActiveTabLoading || activeRows === null;
  const tableColumnSpan = showVisitors ? 3 : 2;
  const resolvedEmptyLabel = emptyLabel ?? messages.common.noData;

  useEffect(() => {
    latestLoadRowsRef.current = loadRows;
  }, [loadRows]);

  useEffect(() => {
    setActiveTab(tabs[0].value);
    setRowsByTab(createRecord(tabs, () => null));
    setLoadingByTab(createRecord(tabs, () => false));
    setSortByTab(createRecord(tabs, () => ({ ...DEFAULT_SORT })));
    setSearchTab(null);
    setSearchTerm("");
  }, [requestKey, tabs]);

  useEffect(() => {
    if (activeRows !== null || isActiveTabLoading) return;

    let active = true;
    setLoadingByTab((previous) => ({
      ...previous,
      [activeTab]: true,
    }));

    latestLoadRowsRef
      .current(activeTab)
      .then((nextRows) => normalizeRows(nextRows))
      .then((nextRows) => {
        if (!active) return;
        setRowsByTab((previous) => ({
          ...previous,
          [activeTab]: nextRows,
        }));
      })
      .catch(() => {
        if (!active) return;
        setRowsByTab((previous) => ({
          ...previous,
          [activeTab]: [],
        }));
      })
      .finally(() => {
        if (!active) return;
        setLoadingByTab((previous) => ({
          ...previous,
          [activeTab]: false,
        }));
      });

    return () => {
      active = false;
    };
  }, [activeTab, requestKey]);

  useEffect(() => {
    if (searchTab !== null) return;
    setSearchTerm("");
  }, [searchTab]);

  const tabMeta = useMemo(
    () =>
      tabs.reduce(
        (acc, tab) => {
          acc[tab.value] = {
            label: tab.label,
            columnLabel: tab.columnLabel ?? tab.label,
            primaryMetricLabel: tab.primaryMetricLabel ?? messages.common.views,
          };
          return acc;
        },
        {} as Record<
          T,
          { label: string; columnLabel: string; primaryMetricLabel: string }
        >,
      ),
    [messages.common.views, tabs],
  );

  const sortedRowsByTab = useMemo(() => {
    const next = {} as Record<T, AsyncDimensionBreakdownRow[]>;

    for (const tab of tabs) {
      const currentRows = rowsByTab[tab.value] ?? [];
      const sort = sortByTab[tab.value];
      const sortKey = showVisitors ? sort.key : "views";
      const direction = sort.direction === "asc" ? 1 : -1;

      next[tab.value] = [...currentRows].sort((left, right) => {
        const primary = (left[sortKey] - right[sortKey]) * direction;
        if (primary !== 0) return primary;
        if (right.views !== left.views) return right.views - left.views;
        if (right.visitors !== left.visitors)
          return right.visitors - left.visitors;
        return left.label.localeCompare(right.label);
      });
    }

    return next;
  }, [rowsByTab, showVisitors, sortByTab, tabs]);

  const progressTotalByTab = useMemo(() => {
    const next = {} as Record<T, number>;

    for (const tab of tabs) {
      const sort = sortByTab[tab.value];
      const sortKey = showVisitors ? sort.key : "views";
      next[tab.value] = sortedRowsByTab[tab.value].reduce<number>(
        (sum, row) => sum + Math.max(0, Number(row[sortKey] ?? 0)),
        0,
      );
    }

    return next;
  }, [showVisitors, sortByTab, sortedRowsByTab, tabs]);

  const activeSearchTab = searchTab ?? activeTab;
  const activeSearchRows = sortedRowsByTab[activeSearchTab];
  const normalizedSearchTerm = deferredSearchTerm.trim().toLocaleLowerCase();
  const searchedRows = useMemo(() => {
    if (!normalizedSearchTerm) return activeSearchRows;
    return activeSearchRows.filter((row) =>
      row.label.toLocaleLowerCase().includes(normalizedSearchTerm),
    );
  }, [activeSearchRows, normalizedSearchTerm]);

  const searchPlaceholder = formatI18nTemplate(messages.overview.searchInTab, {
    tab: tabMeta[activeSearchTab].label,
  });

  function toggleSort(tab: T, key: SortKey) {
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

  function renderSortIndicator(tab: T, key: SortKey) {
    const sort = sortByTab[tab];
    const sortKey = showVisitors ? sort.key : "views";
    if (sortKey === key) {
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

  function renderTableHeader(tab: T) {
    const sort = sortByTab[tab];
    const sortKey = showVisitors ? sort.key : "views";
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
                sortKey === "views"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => toggleSort(tab, "views")}
            >
              {meta.primaryMetricLabel}
              {renderSortIndicator(tab, "views")}
            </button>
          </div>
        </TableHead>
        {showVisitors ? (
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
        ) : null}
      </TableRow>
    );
  }

  function renderRows(
    tab: T,
    rows: AsyncDimensionBreakdownRow[],
    contentKeyPrefix: string,
  ) {
    const sort = sortByTab[tab];
    const sortKey = showVisitors ? sort.key : "views";
    const progressTotal = progressTotalByTab[tab];

    return (
      <AnimatePresence initial={false} mode="popLayout">
        {rows.map((row) => {
          const rowValue = Math.max(0, Number(row[sortKey] ?? 0));
          const progressPercent =
            progressTotal > 0
              ? Math.min(100, (rowValue / progressTotal) * 100)
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
              {showVisitors ? (
                <TableCell className="p-0">
                  <div className="px-4 py-2 text-right">
                    {numberFormat(locale, row.visitors)}
                  </div>
                </TableCell>
              ) : null}
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
          loading={
            loadingByTab[activeSearchTab] || rowsByTab[activeSearchTab] === null
          }
          hasContent={searchedRows.length > 0}
          loadingLabel={messages.common.loading}
          emptyLabel={resolvedEmptyLabel}
          colSpan={tableColumnSpan}
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
          <DialogTitle>{searchPlaceholder}</DialogTitle>
        </DialogHeader>
        {searchContent}
      </DialogContent>
    </Dialog>
  );

  const visibleRows = sortedRowsByTab[activeTab];
  const syncKey = [
    activeTab,
    activeLoading ? "loading" : "idle",
    sortByTab[activeTab].key,
    sortByTab[activeTab].direction,
    visibleRows.length,
  ].join(":");

  return (
    <>
      <TabbedScrollMaskCard
        value={activeTab}
        onValueChange={(value) => setActiveTab(value)}
        tabs={[...tabs]}
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
        className={className}
        syncKey={syncKey}
      >
        <DataTableSwitch
          loading={activeLoading}
          hasContent={visibleRows.length > 0}
          loadingLabel={messages.common.loading}
          emptyLabel={resolvedEmptyLabel}
          colSpan={tableColumnSpan}
          header={renderTableHeader(activeTab)}
          rows={renderRows(activeTab, visibleRows, `card-${activeTab}`)}
          contentKey={`card-${activeTab}-${visibleRows.length}`}
        />
      </TabbedScrollMaskCard>
      {searchPanel}
    </>
  );
}
