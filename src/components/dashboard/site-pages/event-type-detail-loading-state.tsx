"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface EventTypeDetailLoadingStateProps {
  loadingLabel?: string;
  className?: string;
}

export function EventTypeDetailLoadingState({
  loadingLabel,
  className,
}: EventTypeDetailLoadingStateProps) {
  return (
    <div
      className={cn("space-y-6", className)}
      aria-busy="true"
      aria-live={loadingLabel ? "polite" : undefined}
    >
      {loadingLabel ? <span className="sr-only">{loadingLabel}</span> : null}
      <EventMetricGridSkeleton />
      <EventTrendCardSkeleton />
      <EventDimensionCardsSkeleton />
      <EventFieldsCardSkeleton />
      <EventRecordsCardSkeleton />
    </div>
  );
}

function EventMetricGridSkeleton() {
  return (
    <Card className="py-0">
      <CardContent className="p-0">
        <div className="grid gap-px overflow-hidden bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={`event-metric-skeleton-${index}`}
              className="min-w-0 bg-card p-4"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Skeleton className="size-3 shrink-0" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="mt-3 h-7 w-24" />
              <Skeleton className="mt-3 h-3 w-[min(12rem,72%)]" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EventTrendCardSkeleton() {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <Skeleton className="h-5 w-28" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton
                key={`event-trend-legend-skeleton-${index}`}
                className="h-6 w-24"
              />
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Skeleton className="h-[320px] w-full" />
          <div className="flex justify-between gap-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton
                key={`event-trend-axis-skeleton-${index}`}
                className="h-3 w-16"
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EventDimensionCardsSkeleton() {
  return (
    <section className="grid items-stretch gap-6 xl:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <EventDimensionCardSkeleton
          key={`event-dimension-card-skeleton-${index}`}
        />
      ))}
    </section>
  );
}

function EventDimensionCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="hidden h-6 w-16 sm:block" />
          </div>
          <Skeleton className="size-6" />
        </div>
      </CardHeader>
      <CardContent>
        <EventRowsSkeleton rows={7} />
      </CardContent>
    </Card>
  );
}

function EventFieldsCardSkeleton() {
  return (
    <Card className="py-0">
      <CardHeader>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-[min(28rem,82%)]" />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={`event-field-row-skeleton-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_5rem_4rem] items-center gap-4 md:grid-cols-[minmax(0,1fr)_6rem_5rem_7rem]"
            >
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-4 w-[min(24rem,86%)]" />
                <Skeleton className="h-3 w-[min(16rem,62%)]" />
              </div>
              <Skeleton className="h-5 w-16" />
              <Skeleton className="ml-auto h-4 w-12" />
              <Skeleton className="ml-auto hidden h-4 w-24 md:block" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EventRecordsCardSkeleton() {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-9 w-full sm:w-80" />
      </div>
      <Card className="py-0">
        <CardContent className="px-4 py-4">
          <EventRowsSkeleton rows={8} />
        </CardContent>
      </Card>
    </section>
  );
}

function EventRowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={`event-detail-row-skeleton-${rows}-${index}`}
          className="grid grid-cols-[1fr_auto] items-center gap-4"
        >
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-[min(22rem,86%)]" />
            <Skeleton className="h-3 w-[min(14rem,60%)]" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
