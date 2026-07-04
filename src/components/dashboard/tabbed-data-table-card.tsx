"use client";

import {
  type ReactNode,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiSearchLine,
} from "@remixicon/react";
import { AnimatePresence, useReducedMotion } from "motion/react";

import { AnimatedDataTableRow } from "@/components/dashboard/animated-data-table-row";
import { DataTableSwitch } from "@/components/dashboard/data-table-switch";
import {
  TabbedScrollMaskCard,
  type TabbedScrollMaskCardTab,
} from "@/components/dashboard/tabbed-scroll-mask-card";
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
import { cn } from "@/lib/utils";

type NonEmptyArray<T> = readonly [T, ...T[]];

export type TabbedDataTableSortDirection = "asc" | "desc";

export interface TabbedDataTableSortState<TKey extends string = string> {
  key: TKey;
  direction: TabbedDataTableSortDirection;
}

export interface TabbedDataTableRowBase {
  key: string;
}

export interface TabbedDataTableTab<
  TTab extends string = string,
> extends TabbedScrollMaskCardTab<TTab> {
  columnLabel?: string;
  defaultSort?: TabbedDataTableSortState<string>;
}

export interface TabbedDataTableColumn<
  TRow extends TabbedDataTableRowBase,
  TKey extends string = string,
  TTab extends string = string,
> {
  key: TKey;
  label: string;
  getValue: (row: TRow, tab: TTab) => number;
  format?: (value: number, row: TRow, tab: TTab) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: TRow, tab: TTab) => number;
  className?: string;
  headerClassName?: string;
  widthClassName?: string;
}

export interface TabbedDataTableRowContext<
  TRow extends TabbedDataTableRowBase,
  TTab extends string,
  TKey extends string,
> {
  row: TRow;
  tab: TTab;
  sort: TabbedDataTableSortState<TKey>;
  source: "card" | "search";
}

export interface TabbedDataTableSearchConfig<
  TRow extends TabbedDataTableRowBase,
  TTab extends string,
> {
  enabled?: boolean;
  getText?: (row: TRow, tab: TTab) => string;
  placeholder?: (tab: TabbedDataTableTab<TTab>) => string;
  title?: (tab: TabbedDataTableTab<TTab>) => string;
  actionLabel?: string;
}

export interface TabbedDataTableCardProps<
  TTab extends string,
  TRow extends TabbedDataTableRowBase,
  TKey extends string = string,
> {
  tabs: NonEmptyArray<TabbedDataTableTab<TTab>>;
  columns:
    | readonly TabbedDataTableColumn<TRow, TKey, TTab>[]
    | ((tab: TTab) => readonly TabbedDataTableColumn<TRow, TKey, TTab>[]);
  renderLabel: (
    row: TRow,
    context: TabbedDataTableRowContext<TRow, TTab, TKey>,
  ) => ReactNode;
  rowsByTab?: Partial<Record<TTab, readonly TRow[] | null>>;
  loadingByTab?: Partial<Record<TTab, boolean>>;
  loadRows?: (tab: TTab, signal: AbortSignal) => Promise<readonly TRow[]>;
  normalizeRows?: (rows: readonly TRow[], tab: TTab) => TRow[];
  filterRows?: (rows: readonly TRow[], tab: TTab) => TRow[];
  compareRows?: (
    left: TRow,
    right: TRow,
    context: {
      tab: TTab;
      sort: TabbedDataTableSortState<TKey>;
      columns: readonly TabbedDataTableColumn<TRow, TKey, TTab>[];
    },
  ) => number;
  value?: TTab;
  defaultValue?: TTab;
  onValueChange?: (value: TTab) => void;
  requestKey?: string | number;
  defaultSort?: TabbedDataTableSortState<TKey>;
  sortByTab?: Partial<Record<TTab, TabbedDataTableSortState<TKey>>>;
  onSortChange?: (tab: TTab, sort: TabbedDataTableSortState<TKey>) => void;
  labelColumnLabel?: string | ((tab: TabbedDataTableTab<TTab>) => string);
  loadingLabel: string;
  emptyLabel: string;
  search?: false | TabbedDataTableSearchConfig<TRow, TTab>;
  headerRight?: ReactNode;
  headerHidden?: boolean;
  className?: string;
  tabsListClassName?: string;
  tabTriggerClassName?: string;
  viewportClassName?: string;
  rowKeyPrefix?: string;
  progress?: false | "sort" | TKey;
  getRowKey?: (row: TRow, tab: TTab) => string;
  getRowSearchText?: (row: TRow, tab: TTab) => string;
  getRowActive?: (row: TRow, tab: TTab) => boolean;
  getRowInteractive?: (row: TRow, tab: TTab) => boolean;
  getRowClassName?: (
    row: TRow,
    context: TabbedDataTableRowContext<TRow, TTab, TKey>,
  ) => string | undefined;
  onRowClick?: (
    row: TRow,
    context: TabbedDataTableRowContext<TRow, TTab, TKey>,
  ) => void;
  formatNumber?: (value: number, row: TRow, tab: TTab) => ReactNode;
}

function defaultNormalizeRows<TRow extends TabbedDataTableRowBase>(
  rows: readonly TRow[],
): TRow[] {
  return [...rows];
}

function createTabRecord<TTab extends string, TValue>(
  tabs: readonly TabbedDataTableTab<TTab>[],
  createValue: (tab: TabbedDataTableTab<TTab>) => TValue,
): Record<TTab, TValue> {
  return tabs.reduce(
    (acc, tab) => {
      acc[tab.value] = createValue(tab);
      return acc;
    },
    {} as Record<TTab, TValue>,
  );
}

function getColumnsForTab<
  TTab extends string,
  TRow extends TabbedDataTableRowBase,
  TKey extends string,
>(
  columns:
    | readonly TabbedDataTableColumn<TRow, TKey, TTab>[]
    | ((tab: TTab) => readonly TabbedDataTableColumn<TRow, TKey, TTab>[]),
  tab: TTab,
): readonly TabbedDataTableColumn<TRow, TKey, TTab>[] {
  return typeof columns === "function" ? columns(tab) : columns;
}

function firstSortableColumnKey<
  TRow extends TabbedDataTableRowBase,
  TKey extends string,
  TTab extends string,
>(columns: readonly TabbedDataTableColumn<TRow, TKey, TTab>[]): TKey {
  return (columns.find((column) => column.sortable !== false) ?? columns[0])
    .key;
}

export function TabbedDataTableCard<
  TTab extends string,
  TRow extends TabbedDataTableRowBase,
  TKey extends string = string,
>({
  tabs,
  columns,
  renderLabel,
  rowsByTab,
  loadingByTab,
  loadRows,
  normalizeRows = defaultNormalizeRows,
  filterRows,
  compareRows,
  value,
  defaultValue,
  onValueChange,
  requestKey,
  defaultSort,
  sortByTab: controlledSortByTab,
  onSortChange,
  labelColumnLabel,
  loadingLabel,
  emptyLabel,
  search,
  headerRight,
  headerHidden = false,
  className,
  tabsListClassName,
  tabTriggerClassName,
  viewportClassName,
  rowKeyPrefix,
  progress = "sort",
  getRowKey,
  getRowSearchText,
  getRowActive,
  getRowInteractive,
  getRowClassName,
  onRowClick,
  formatNumber,
}: TabbedDataTableCardProps<TTab, TRow, TKey>) {
  const isMobile = useIsMobile();
  const reduceDataRowMotion = useReducedMotion() ?? false;
  const controlled = value !== undefined;
  const tabsKey = useMemo(
    () =>
      tabs
        .map(
          (tab) =>
            `${tab.value}:${tab.label}:${tab.columnLabel ?? ""}:${tab.defaultSort?.key ?? ""}:${tab.defaultSort?.direction ?? ""}`,
        )
        .join("|"),
    [tabs],
  );
  const [internalTab, setInternalTab] = useState<TTab>(
    defaultValue ?? tabs[0].value,
  );
  const activeTab = controlled ? value : internalTab;
  const [loadedRowsByTab, setLoadedRowsByTab] = useState<
    Record<TTab, TRow[] | null>
  >(() => createTabRecord(tabs, () => null));
  const [internalLoadingByTab, setInternalLoadingByTab] = useState<
    Record<TTab, boolean>
  >(() => createTabRecord(tabs, () => false));
  const [sortByTab, setSortByTab] = useState<
    Record<TTab, TabbedDataTableSortState<TKey>>
  >(() =>
    createTabRecord(tabs, (tab) => {
      const tabColumns = getColumnsForTab(columns, tab.value);
      return {
        key:
          (tab.defaultSort?.key as TKey | undefined) ??
          defaultSort?.key ??
          firstSortableColumnKey(tabColumns),
        direction:
          tab.defaultSort?.direction ?? defaultSort?.direction ?? "desc",
      };
    }),
  );
  const [searchTab, setSearchTab] = useState<TTab | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const latestLoadRowsRef = useRef(loadRows);
  const latestNormalizeRowsRef = useRef(normalizeRows);
  const latestTabsRef = useRef(tabs);
  const latestColumnsRef = useRef(columns);
  const loadedRowsByTabRef = useRef(loadedRowsByTab);
  const loadingByTabRef = useRef(internalLoadingByTab);

  loadedRowsByTabRef.current = loadedRowsByTab;
  loadingByTabRef.current = internalLoadingByTab;

  useEffect(() => {
    latestLoadRowsRef.current = loadRows;
  }, [loadRows]);

  useEffect(() => {
    latestNormalizeRowsRef.current = normalizeRows;
  }, [normalizeRows]);

  useEffect(() => {
    latestTabsRef.current = tabs;
    latestColumnsRef.current = columns;
  }, [columns, tabs]);

  useEffect(() => {
    const nextTabs = latestTabsRef.current;
    if (nextTabs.some((tab) => tab.value === activeTab)) return;
    const next = nextTabs[0].value;
    if (!controlled) setInternalTab(next);
    onValueChange?.(next);
  }, [activeTab, controlled, onValueChange, tabsKey]);

  useEffect(() => {
    const nextTabs = latestTabsRef.current;
    const nextColumns = latestColumnsRef.current;
    setLoadedRowsByTab(createTabRecord(nextTabs, () => null));
    setInternalLoadingByTab(createTabRecord(nextTabs, () => false));
    setSortByTab(
      createTabRecord(nextTabs, (tab) => {
        const tabColumns = getColumnsForTab(nextColumns, tab.value);
        return {
          key:
            (tab.defaultSort?.key as TKey | undefined) ??
            defaultSort?.key ??
            firstSortableColumnKey(tabColumns),
          direction:
            tab.defaultSort?.direction ?? defaultSort?.direction ?? "desc",
        };
      }),
    );
    setSearchTab(null);
    setSearchTerm("");
    setLoadVersion((previous) => previous + 1);
  }, [defaultSort?.direction, defaultSort?.key, requestKey, tabsKey]);

  useEffect(() => {
    if (!latestLoadRowsRef.current) return;
    if (
      loadedRowsByTabRef.current[activeTab] !== null ||
      loadingByTabRef.current[activeTab]
    ) {
      return;
    }

    const controller = new AbortController();
    setInternalLoadingByTab((previous) => ({
      ...previous,
      [activeTab]: true,
    }));

    latestLoadRowsRef
      .current(activeTab, controller.signal)
      .then((nextRows) => latestNormalizeRowsRef.current(nextRows, activeTab))
      .then((nextRows) => {
        if (controller.signal.aborted) return;
        setLoadedRowsByTab((previous) => ({
          ...previous,
          [activeTab]: nextRows,
        }));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoadedRowsByTab((previous) => ({
          ...previous,
          [activeTab]: [],
        }));
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setInternalLoadingByTab((previous) => ({
          ...previous,
          [activeTab]: false,
        }));
      });

    return () => {
      controller.abort();
    };
  }, [activeTab, loadVersion, requestKey]);

  useEffect(() => {
    if (searchTab !== null) return;
    setSearchTerm("");
  }, [searchTab]);

  const effectiveSortByTab = useMemo(
    () =>
      createTabRecord(
        tabs,
        (tab) => controlledSortByTab?.[tab.value] ?? sortByTab[tab.value],
      ),
    [controlledSortByTab, sortByTab, tabs],
  );
  const searchConfig = search === false ? null : (search ?? {});
  const searchEnabled = searchConfig?.enabled ?? true;
  const externalRowsByTab = (rowsByTab ?? {}) as Partial<
    Record<TTab, readonly TRow[] | null>
  >;
  const activeSearchTab = searchTab ?? activeTab;

  const resolvedRowsByTab = useMemo(() => {
    return createTabRecord(tabs, (tab) => {
      const externalRows = externalRowsByTab[tab.value];
      if (externalRows !== undefined) {
        return externalRows === null
          ? null
          : normalizeRows(externalRows, tab.value);
      }
      return loadedRowsByTab[tab.value];
    });
  }, [externalRowsByTab, loadedRowsByTab, normalizeRows, tabs]);

  const resolvedLoadingByTab = useMemo(
    () =>
      createTabRecord(tabs, (tab) =>
        Boolean(loadingByTab?.[tab.value] ?? internalLoadingByTab[tab.value]),
      ),
    [internalLoadingByTab, loadingByTab, tabs],
  );

  const sortedRowsByTab = useMemo(() => {
    return createTabRecord(tabs, (tab) => {
      const tabValue = tab.value;
      const tabRows = resolvedRowsByTab[tabValue] ?? [];
      const tabColumns = getColumnsForTab(columns, tabValue);
      const sort = effectiveSortByTab[tabValue];
      const sortColumn =
        tabColumns.find((column) => column.key === sort.key) ?? tabColumns[0];
      const direction = sort.direction === "asc" ? 1 : -1;
      const sorted = [...tabRows].sort((left, right) => {
        if (compareRows) {
          const custom = compareRows(left, right, {
            tab: tabValue,
            sort,
            columns: tabColumns,
          });
          if (custom !== 0) return custom;
        }

        const leftValue =
          sortColumn.sortValue?.(left, tabValue) ??
          sortColumn.getValue(left, tabValue);
        const rightValue =
          sortColumn.sortValue?.(right, tabValue) ??
          sortColumn.getValue(right, tabValue);
        const primary = (leftValue - rightValue) * direction;
        if (primary !== 0) return primary;
        return String(
          getRowSearchText?.(left, tabValue) ?? left.key,
        ).localeCompare(
          String(getRowSearchText?.(right, tabValue) ?? right.key),
        );
      });

      return filterRows ? filterRows(sorted, tabValue) : sorted;
    });
  }, [
    columns,
    compareRows,
    filterRows,
    getRowSearchText,
    resolvedRowsByTab,
    effectiveSortByTab,
    tabs,
  ]);

  const normalizedSearchTerm = deferredSearchTerm.trim().toLocaleLowerCase();
  const searchedRows = useMemo(() => {
    const rows = sortedRowsByTab[activeSearchTab];
    if (!normalizedSearchTerm) return rows;
    const getText =
      searchConfig?.getText ?? getRowSearchText ?? ((row: TRow) => row.key);
    return rows.filter((row) =>
      getText(row, activeSearchTab)
        .toLocaleLowerCase()
        .includes(normalizedSearchTerm),
    );
  }, [
    activeSearchTab,
    getRowSearchText,
    normalizedSearchTerm,
    searchConfig,
    sortedRowsByTab,
  ]);

  const tabByValue = useMemo(
    () => new Map(tabs.map((tab) => [tab.value, tab])),
    [tabs],
  );
  const activeTabMeta = tabByValue.get(activeTab) ?? tabs[0];
  const activeSearchTabMeta = tabByValue.get(activeSearchTab) ?? activeTabMeta;
  const activeRows = sortedRowsByTab[activeTab];
  const activeLoading =
    resolvedLoadingByTab[activeTab] || resolvedRowsByTab[activeTab] === null;
  const searchLoading =
    resolvedLoadingByTab[activeSearchTab] ||
    resolvedRowsByTab[activeSearchTab] === null;
  const activeColumns = getColumnsForTab(columns, activeTab);
  const activeSearchColumns = getColumnsForTab(columns, activeSearchTab);
  const colSpan = 1 + activeColumns.length;
  const searchColSpan = 1 + activeSearchColumns.length;

  const activeSearchTitle =
    searchConfig?.title?.(activeSearchTabMeta) ??
    searchConfig?.placeholder?.(activeSearchTabMeta) ??
    activeSearchTabMeta.label;
  const activeSearchPlaceholder =
    searchConfig?.placeholder?.(activeSearchTabMeta) ?? activeSearchTitle;
  const searchActionLabel = searchConfig?.actionLabel ?? activeSearchTitle;

  function setActiveTab(next: TTab) {
    if (!controlled) {
      startTransition(() => setInternalTab(next));
    }
    onValueChange?.(next);
  }

  function toggleSort(tab: TTab, key: TKey) {
    const current = effectiveSortByTab[tab];
    const next: TabbedDataTableSortState<TKey> =
      current.key === key
        ? {
            key,
            direction: current.direction === "desc" ? "asc" : "desc",
          }
        : { key, direction: "desc" as const };
    if (onSortChange) {
      onSortChange(tab, next);
      return;
    }
    setSortByTab((previous) => ({
      ...previous,
      [tab]: next,
    }));
  }

  function renderSortIndicator(tab: TTab, key: TKey) {
    const sort = effectiveSortByTab[tab];
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

  function renderTableHeader(
    tab: TTab,
    metricColumns: readonly TabbedDataTableColumn<TRow, TKey, TTab>[],
  ) {
    const tabMeta = tabByValue.get(tab) ?? tabs[0];
    const firstColumnLabel =
      typeof labelColumnLabel === "function"
        ? labelColumnLabel(tabMeta)
        : (labelColumnLabel ?? tabMeta.columnLabel ?? tabMeta.label);

    return (
      <TableRow className="hover:bg-transparent">
        <TableHead className="h-8 p-0">
          <div className="px-4">{firstColumnLabel}</div>
        </TableHead>
        {metricColumns.map((column) => {
          const sortable = column.sortable !== false;
          const active = effectiveSortByTab[tab].key === column.key;

          return (
            <TableHead
              key={column.key}
              className={cn("h-8 w-20 p-0", column.widthClassName)}
            >
              <div className="flex justify-end px-2">
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 whitespace-nowrap transition-colors",
                    active ? "text-foreground" : "text-muted-foreground",
                    !sortable && "cursor-default",
                    column.headerClassName,
                  )}
                  onClick={() => {
                    if (sortable) toggleSort(tab, column.key);
                  }}
                >
                  {column.label}
                  {sortable ? renderSortIndicator(tab, column.key) : null}
                </button>
              </div>
            </TableHead>
          );
        })}
      </TableRow>
    );
  }

  function renderRows(
    tab: TTab,
    rows: readonly TRow[],
    metricColumns: readonly TabbedDataTableColumn<TRow, TKey, TTab>[],
    source: "card" | "search",
  ) {
    const sort = effectiveSortByTab[tab];
    const progressColumn =
      progress === false
        ? null
        : (metricColumns.find((column) =>
            progress === "sort"
              ? column.key === sort.key
              : column.key === progress,
          ) ?? metricColumns[0]);
    const progressTotal = progressColumn
      ? rows.reduce(
          (sum, row) =>
            sum +
            Math.max(
              0,
              Number(
                progressColumn.sortValue?.(row, tab) ??
                  progressColumn.getValue(row, tab),
              ),
            ),
          0,
        )
      : 0;

    return (
      <AnimatePresence initial={false} mode="popLayout">
        {rows.map((row) => {
          const key = getRowKey?.(row, tab) ?? row.key;
          const rowValue = progressColumn
            ? Math.max(
                0,
                Number(
                  progressColumn.sortValue?.(row, tab) ??
                    progressColumn.getValue(row, tab),
                ),
              )
            : 0;
          const progressPercent =
            progressColumn && progressTotal > 0
              ? Math.min(100, (rowValue / progressTotal) * 100)
              : 0;
          const context = { row, tab, sort, source };
          const active = getRowActive?.(row, tab) ?? false;
          const interactive =
            getRowInteractive?.(row, tab) ?? Boolean(onRowClick);

          return (
            <AnimatedDataTableRow
              key={`${rowKeyPrefix ?? source}-${tab}-${key}`}
              reduceMotion={reduceDataRowMotion}
              className={cn(
                "group/row bg-no-repeat transition-[background-size,filter] duration-300 ease-out hover:bg-transparent",
                interactive
                  ? "cursor-pointer hover:brightness-95"
                  : "cursor-default",
                active && "brightness-95",
                getRowClassName?.(row, context),
              )}
              style={
                progressColumn
                  ? {
                      backgroundImage:
                        "linear-gradient(90deg, var(--muted) 0%, var(--muted) 100%)",
                      backgroundSize: `${progressPercent.toFixed(2)}% 100%`,
                      backgroundPosition: "left top",
                    }
                  : undefined
              }
              onClick={() => onRowClick?.(row, context)}
            >
              <TableCell className="whitespace-normal p-0 align-top">
                <div className="px-4 py-2 leading-5 whitespace-normal break-words">
                  {renderLabel(row, context)}
                </div>
              </TableCell>
              {metricColumns.map((column, index) => {
                const value = column.getValue(row, tab);
                return (
                  <TableCell key={column.key} className="p-0">
                    <div
                      className={cn(
                        index === metricColumns.length - 1
                          ? "px-4 py-2 text-right"
                          : "px-2 py-2 text-right",
                        column.className,
                      )}
                    >
                      {column.format?.(value, row, tab) ??
                        formatNumber?.(value, row, tab) ??
                        value}
                    </div>
                  </TableCell>
                );
              })}
            </AnimatedDataTableRow>
          );
        })}
      </AnimatePresence>
    );
  }

  const searchContent = searchEnabled ? (
    <div className="space-y-3">
      <Input
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder={activeSearchPlaceholder}
      />
      <div className="max-h-[60vh] overflow-auto pr-1">
        <DataTableSwitch
          loading={searchLoading}
          hasContent={searchedRows.length > 0}
          loadingLabel={loadingLabel}
          emptyLabel={emptyLabel}
          colSpan={searchColSpan}
          header={renderTableHeader(activeSearchTab, activeSearchColumns)}
          rows={renderRows(
            activeSearchTab,
            searchedRows,
            activeSearchColumns,
            "search",
          )}
          contentKey={`search-${activeSearchTab}-${deferredSearchTerm}-${searchedRows.length}`}
        />
      </div>
    </div>
  ) : null;

  const searchPanel =
    searchEnabled && searchContent ? (
      isMobile ? (
        <Drawer
          open={searchTab !== null}
          onOpenChange={(open) => {
            if (!open) setSearchTab(null);
          }}
        >
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle>{activeSearchTitle}</DrawerTitle>
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
              <DialogTitle icon={RiSearchLine}>{activeSearchTitle}</DialogTitle>
            </DialogHeader>
            {searchContent}
          </DialogContent>
        </Dialog>
      )
    ) : null;

  const searchAction =
    searchEnabled && !headerHidden ? (
      <Clickable
        className="size-6 text-muted-foreground hover:text-foreground"
        onClick={() => setSearchTab(activeTab)}
        aria-label={searchActionLabel}
        title={searchActionLabel}
      >
        <RiSearchLine className="size-4" />
      </Clickable>
    ) : null;

  const syncKey = [
    activeTab,
    activeLoading ? "loading" : "idle",
    effectiveSortByTab[activeTab].key,
    effectiveSortByTab[activeTab].direction,
    activeRows.length,
  ].join(":");

  return (
    <>
      <TabbedScrollMaskCard
        value={activeTab}
        onValueChange={(next) => setActiveTab(next)}
        tabs={[...tabs]}
        headerRight={
          headerRight || searchAction ? (
            <div className="inline-flex items-center gap-1">
              {headerRight}
              {searchAction}
            </div>
          ) : undefined
        }
        headerHidden={headerHidden}
        className={className}
        tabsListClassName={tabsListClassName}
        tabTriggerClassName={tabTriggerClassName}
        viewportClassName={viewportClassName}
        syncKey={syncKey}
      >
        <DataTableSwitch
          loading={activeLoading}
          hasContent={activeRows.length > 0}
          loadingLabel={loadingLabel}
          emptyLabel={emptyLabel}
          colSpan={colSpan}
          header={renderTableHeader(activeTab, activeColumns)}
          rows={renderRows(activeTab, activeRows, activeColumns, "card")}
          contentKey={`card-${activeTab}-${activeRows.length}`}
        />
      </TabbedScrollMaskCard>
      {searchPanel}
    </>
  );
}
