"use client";

import { type ComponentType, useMemo } from "react";
import { RiDonutChartLine } from "@remixicon/react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { numberFormat, percentFormat } from "@/lib/dashboard/format";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--muted-foreground)",
] as const;

export interface ShareRadialCardItem {
  key: string;
  label: string;
  value: number;
  isOther?: boolean;
  color?: string;
  icon?: ComponentType<{ className?: string }>;
}

interface ShareRadialCardProps {
  title: string;
  items: ShareRadialCardItem[];
  locale: Locale;
  valueLabel: string;
  loading?: boolean;
  emptyLabel?: string;
}

type ResolvedShareItem = ShareRadialCardItem & {
  color: string;
  share: number;
  value: number;
};

function resolveShareItems(
  items: ShareRadialCardItem[],
  totalValue: number,
): ResolvedShareItem[] {
  return items.map((item, index) => {
    const value = Math.max(0, Number(item.value ?? 0));

    return {
      ...item,
      value,
      share: totalValue > 0 ? value / totalValue : 0,
      color:
        item.color ??
        (item.isOther
          ? "var(--muted-foreground)"
          : CHART_COLORS[index % CHART_COLORS.length]),
    };
  });
}

export function ShareRadialCard({
  title,
  items,
  locale,
  valueLabel,
  loading = false,
  emptyLabel,
}: ShareRadialCardProps) {
  const totalValue = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + Math.max(0, Number(item.value ?? 0)),
        0,
      ),
    [items],
  );
  const resolvedItems = useMemo(
    () => resolveShareItems(items, totalValue),
    [items, totalValue],
  );
  const ariaLabel = `${title}: ${resolvedItems
    .map(
      (item) =>
        `${item.label} ${percentFormat(locale, item.share)} (${numberFormat(locale, item.value)} ${valueLabel})`,
    )
    .join(", ")}`;

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle className="inline-flex items-center gap-2">
          <RiDonutChartLine className="size-4" />
          {title}
        </CardTitle>
        {loading ? (
          <div className="flex items-baseline gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xl font-medium tabular-nums text-foreground">
              {numberFormat(locale, totalValue)}
            </span>
            <span className="text-xs text-muted-foreground">{valueLabel}</span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <ShareRadialCardContentSkeleton />
        ) : resolvedItems.length > 0 ? (
          <div className="grid gap-4">
            <div
              className="flex h-6 w-full overflow-hidden rounded-none bg-muted ring-1 ring-border/50"
              role="img"
              aria-label={ariaLabel}
            >
              {resolvedItems.map((item) => {
                const width = `${Math.min(100, Math.max(0, item.share * 100)).toFixed(2)}%`;
                const titleText = `${item.label}: ${numberFormat(locale, item.value)} ${valueLabel}, ${percentFormat(locale, item.share)}`;

                return (
                  <div
                    key={item.key}
                    className={cn(
                      "h-full min-w-0 shrink-0 border-r border-background/80 last:border-r-0",
                      item.share <= 0 && "hidden",
                    )}
                    style={{
                      width,
                      backgroundColor: item.color,
                    }}
                    title={titleText}
                  />
                );
              })}
            </div>

            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {resolvedItems.map((item) => {
                const ItemIcon = item.icon;

                return (
                  <div
                    key={item.key}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: item.color }}
                      />
                      {ItemIcon ? (
                        <ItemIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : null}
                      <span className="truncate text-xs text-muted-foreground">
                        {item.label}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-2">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {numberFormat(locale, item.value)}
                      </span>
                      <span className="font-mono text-xs font-medium tabular-nums text-foreground">
                        {percentFormat(locale, item.share)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            className="flex min-h-[96px] items-center justify-center text-sm text-muted-foreground"
            role="status"
          >
            {emptyLabel}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ShareRadialCardContentSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-6 w-full" />
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={`share-radial-card-content-skeleton-${index}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Skeleton className="size-2.5 shrink-0" />
              <Skeleton className="h-4 w-[min(12rem,55%)]" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShareRadialCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader className="gap-2">
        <Skeleton className="h-4 w-36" />
        <div className="flex items-baseline gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
      </CardHeader>
      <CardContent>
        <ShareRadialCardContentSkeleton />
      </CardContent>
    </Card>
  );
}
