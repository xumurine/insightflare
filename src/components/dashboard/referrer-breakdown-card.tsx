"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import {
  RiArrowDownSLine,
  RiArrowRightUpLine,
  RiArrowUpSLine,
  RiSearchLine,
} from "@remixicon/react";
import { DataTableSwitch } from "@/components/dashboard/data-table-switch";
import {
  REFERRER_QUERY_PARAM_BY_TAB,
  LabelWithOptionalIcon,
  type ReferrerRowsByTab,
  type ReferrerTab,
} from "@/components/dashboard/referrer-utils";
import { TabbedScrollMaskCard } from "@/components/dashboard/tabbed-scroll-mask-card";
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
import { Clickable } from "@/components/ui/clickable";
import { Input } from "@/components/ui/input";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { numberFormat } from "@/lib/dashboard/format";
import { replaceUrlWithoutNavigation, useLiveSearchParams } from "@/lib/client-history";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { formatI18nTemplate } from "@/lib/i18n/template";
import { cn } from "@/lib/utils";

type ReferrerSortKey = "views" | "visitors";

interface ReferrerBreakdownCardProps {
  locale: Locale;
  messages: AppMessages;
  pathname: string;
  rowsByTab: ReferrerRowsByTab;
  loading: boolean;
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
  const [tab, setTab] = useState<ReferrerTab>("domain");
  const [sort, setSort] = useState<{
    key: ReferrerSortKey;
    direction: "asc" | "desc";
  }>({
    key: "views",
    direction: "desc",
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!searchOpen) {
      setSearchTerm("");
    }
  }, [searchOpen]);

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
  const activeTabMeta = tabMeta[tab];
  const activeQueryValue = useMemo(() => {
    const raw = searchParams.get(REFERRER_QUERY_PARAM_BY_TAB[tab]);
    const normalized = String(raw ?? "").trim();
    return normalized || null;
  }, [searchParams, tab]);
  const sortedRows = useMemo(() => {
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...rowsByTab[tab]].sort((left, right) => {
      const primary = (left[sort.key] - right[sort.key]) * direction;
      if (primary !== 0) return primary;
      if (right.views !== left.views) return right.views - left.views;
      if (right.visitors !== left.visitors) return right.visitors - left.visitors;
      return left.label.localeCompare(right.label);
    });
  }, [rowsByTab, sort.direction, sort.key, tab]);
  const visibleRows = useMemo(
    () =>
      activeQueryValue
        ? sortedRows.filter((row) => row.filterValue === activeQueryValue)
        : sortedRows,
    [activeQueryValue, sortedRows],
  );
  const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase();
  const searchedRows = useMemo(() => {
    if (!normalizedSearchTerm) return sortedRows;
    return sortedRows.filter((row) =>
      row.label.toLocaleLowerCase().includes(normalizedSearchTerm),
    );
  }, [normalizedSearchTerm, sortedRows]);
  const progressTotal = useMemo(
    () =>
      sortedRows.reduce(
        (sum, row) => sum + Math.max(0, Number(row[sort.key] ?? 0)),
        0,
      ),
    [sortedRows, sort.key],
  );
  const searchPlaceholder = formatI18nTemplate(messages.overview.searchInTab, {
    tab: activeTabMeta.label,
  });

  function setQueryFilter(next: { tab: ReferrerTab; value: string } | null) {
    const params = new URLSearchParams(searchParams.toString());
    const activeTab = next?.tab ?? tab;
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

  function toggleRowFilter(value: string) {
    const normalized = value.trim();
    const isActive = activeQueryValue === normalized;
    setQueryFilter(isActive ? null : { tab, value: normalized });
  }

  function toggleSort(key: ReferrerSortKey) {
    setSort((previous) =>
      previous.key === key
        ? {
            key,
            direction: previous.direction === "desc" ? "asc" : "desc",
          }
        : { key, direction: "desc" },
    );
  }

  function openTarget(targetUrl: string, event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
    globalThis.window.open(targetUrl, "_blank", "noopener,noreferrer");
  }

  function renderSortIndicator(key: ReferrerSortKey) {
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

  const tableHeader = (
    <TableRow className="hover:bg-transparent">
      <TableHead className="h-8 p-0">
        <div className="px-4">{activeTabMeta.columnLabel}</div>
      </TableHead>
      <TableHead className="h-8 w-20 p-0">
        <div className="flex justify-end px-2">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap transition-colors",
              sort.key === "views" ? "text-foreground" : "text-muted-foreground",
            )}
            onClick={() => toggleSort("views")}
          >
            {messages.common.views}
            {renderSortIndicator("views")}
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
            onClick={() => toggleSort("visitors")}
          >
            {messages.common.visitors}
            {renderSortIndicator("visitors")}
          </button>
        </div>
      </TableHead>
    </TableRow>
  );

  const renderRows = (
    rows: ReferrerRowsByTab[ReferrerTab],
    contentKeyPrefix: string,
  ) =>
    rows.map((row) => {
      const rowValue = Math.max(0, Number(row[sort.key] ?? 0));
      const progressPercent =
        progressTotal > 0
          ? Math.min(100, (rowValue / progressTotal) * 100)
          : 0;
      const rowActive = activeQueryValue === row.filterValue;

      return (
        <TableRow
          key={`${contentKeyPrefix}-${row.key}`}
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
          onClick={() => toggleRowFilter(row.filterValue)}
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
                  label={row.label}
                  showIcon={activeTabMeta.showIcon}
                  unknownLabel={messages.overview.direct}
                />
                {row.targetUrl ? (
                  <Clickable
                    className="inline-flex text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-foreground"
                    onClick={(event) => openTarget(row.targetUrl!, event)}
                    aria-label={row.label}
                    title={row.label}
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
        </TableRow>
      );
    });

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
          header={tableHeader}
          rows={renderRows(searchedRows, `search-${tab}`)}
          contentKey={`search-${tab}-${searchTerm}-${searchedRows.length}`}
        />
      </div>
    </div>
  );

  const searchPanel = isMobile ? (
    <Drawer open={searchOpen} onOpenChange={setSearchOpen}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>{searchPlaceholder}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4">{searchContent}</div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
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
          {messages.referrers.breakdownTitle}
        </h2>
      </div>

      <TabbedScrollMaskCard
        value={tab}
        onValueChange={(value) => setTab(value)}
        tabs={[
          { value: "domain", label: tabMeta.domain.label },
          { value: "link", label: tabMeta.link.label },
        ]}
        headerRight={
          <Clickable
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={() => setSearchOpen(true)}
            aria-label={messages.common.search}
            title={messages.common.search}
          >
            <RiSearchLine className="size-4" />
          </Clickable>
        }
        className="min-h-[420px]"
        syncKey={`${loading}-${tab}-${sort.key}-${sort.direction}-${sortedRows.length}-${activeQueryValue ?? "all"}-${visibleRows.length}`}
      >
        <DataTableSwitch
          loading={loading}
          hasContent={visibleRows.length > 0}
          loadingLabel={messages.common.loading}
          emptyLabel={messages.common.noData}
          colSpan={3}
          header={tableHeader}
          rows={renderRows(visibleRows, `main-${tab}`)}
          contentKey={`${tab}-${activeQueryValue ?? "all"}-${visibleRows.length}`}
        />
      </TabbedScrollMaskCard>

      {searchPanel}
    </section>
  );
}
