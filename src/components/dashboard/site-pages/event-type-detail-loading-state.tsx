import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <section className="grid items-stretch gap-6 xl:grid-cols-2">
      <Card className="h-full overflow-hidden py-0">
        <CardHeader className="space-y-2 pt-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-[min(28rem,82%)]" />
        </CardHeader>
        <CardContent className="space-y-2 pb-4">
          <div className="max-h-[38rem] overflow-auto pr-1 font-mono text-[13px] leading-6">
            <div className="min-w-max space-y-0.5">
              {[
                {
                  indent: 0,
                  width: "w-24",
                  expandable: true,
                  searchable: false,
                },
                {
                  indent: 1,
                  width: "w-20",
                  expandable: true,
                  searchable: false,
                },
                {
                  indent: 2,
                  width: "w-16",
                  expandable: false,
                  searchable: true,
                },
                {
                  indent: 2,
                  width: "w-16",
                  expandable: false,
                  searchable: true,
                },
                {
                  indent: 0,
                  width: "w-20",
                  expandable: true,
                  searchable: false,
                },
                {
                  indent: 1,
                  width: "w-28",
                  expandable: false,
                  searchable: true,
                },
                {
                  indent: 1,
                  width: "w-24",
                  expandable: false,
                  searchable: true,
                  selected: true,
                },
                {
                  indent: 0,
                  width: "w-20",
                  expandable: false,
                  searchable: true,
                },
              ].map((row, index) => (
                <div
                  key={`event-field-tree-skeleton-${index}`}
                  className={cn(
                    "flex items-center gap-2 rounded px-1 py-1",
                    row.searchable && "bg-muted/15",
                    row.selected && "bg-muted/35 ring-1 ring-border/60",
                  )}
                  style={{ paddingLeft: `${row.indent * 1.25}rem` }}
                >
                  {row.expandable ? (
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-none bg-primary/10">
                      <Skeleton className="size-3.5 bg-primary/30" />
                    </div>
                  ) : (
                    <span className="size-6 shrink-0" />
                  )}
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <Skeleton className={`h-4 ${row.width}`} />
                    {row.searchable ? (
                      <Skeleton className="size-6 shrink-0 rounded-none" />
                    ) : (
                      <span className="size-6 shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="h-full overflow-hidden py-0">
        <CardHeader className="space-y-2 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-[min(24rem,76%)]" />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-32" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 p-0">
                  <div className="px-4">
                    <Skeleton className="h-3 w-16" />
                  </div>
                </TableHead>
                <TableHead className="h-8 w-24 p-0">
                  <div className="flex justify-end px-4">
                    <Skeleton className="h-3 w-12" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }, (_, index) => (
                <TableRow key={`event-field-value-row-skeleton-${index}`}>
                  <TableCell className="whitespace-normal p-0 align-top">
                    <div className="px-4 py-2">
                      <Skeleton className="h-4 w-[min(16rem,70%)]" />
                    </div>
                  </TableCell>
                  <TableCell className="p-0">
                    <div className="flex justify-end px-4 py-2">
                      <Skeleton className="h-4 w-12" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
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
