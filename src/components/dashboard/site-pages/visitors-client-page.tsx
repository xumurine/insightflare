"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RiArrowRightSLine, RiSearchLine } from "@remixicon/react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";
import {
  BrowserMeta,
  DeviceMeta,
  formatRelativeTime,
  LocationMeta,
  OsMeta,
  ReferrerMeta,
  VisitorAvatar,
} from "@/components/dashboard/journey-display";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { numberFormat } from "@/lib/dashboard/format";
import {
  fetchVisitors,
} from "@/lib/dashboard/client-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import type { VisitorsData } from "@/lib/edge-client";

interface VisitorsClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

type VisitorRow = VisitorsData["data"][number];

const VISITOR_LIMIT = 200;

function copy(locale: Locale) {
  return locale === "zh"
    ? {
        search: "搜索访客...",
        name: "访客",
        anonymous: "匿名访客",
        referrer: "来源",
        location: "地区",
        os: "操作系统",
        browser: "浏览器",
        device: "设备",
        firstSeen: "首次出现",
        activity: "活跃",
        loadError: "无法加载访客数据。",
        empty: "当前时间范围内没有访客。",
      }
    : {
        search: "Search visitors...",
        name: "Visitor",
        anonymous: "Anonymous",
        referrer: "Referrer",
        location: "Location",
        os: "OS",
        browser: "Browser",
        device: "Device",
        firstSeen: "First seen",
        activity: "Activity",
        loadError: "Unable to load visitors.",
        empty: "No visitors in this time range.",
      };
}

function shortId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 9)}...`;
}

function matchesVisitor(row: VisitorRow, query: string): boolean {
  if (!query) return true;
  const target = [
    row.visitorId,
    row.country,
    row.region,
    row.city,
    row.referrerHost,
    row.referrerUrl,
    row.browser,
    row.os,
    row.deviceType,
  ].join(" ").toLocaleLowerCase();
  return target.includes(query.toLocaleLowerCase());
}

export function VisitorsClientPage({
  locale,
  messages,
  siteId,
  pathname,
}: VisitorsClientPageProps) {
  const labels = copy(locale);
  const { filters, window: timeWindow } = useDashboardQuery() as {
    filters: DashboardFilters;
    window: TimeWindow;
  };
  const [rows, setRows] = useState<VisitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const requestKey = useMemo(
    () => [siteId, timeWindow.from, timeWindow.to, filtersKey].join(":"),
    [filtersKey, siteId, timeWindow.from, timeWindow.to],
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    fetchVisitors(siteId, timeWindow, filters, { limit: VISITOR_LIMIT })
      .then((payload) => {
        if (!active) return;
        setRows(payload.data);
      })
      .catch(() => {
        if (!active) return;
        setRows([]);
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestKey]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesVisitor(row, query.trim())),
    [query, rows],
  );

  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.visitors.title}
        subtitle={messages.visitors.subtitle}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <RiSearchLine className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.search}
            className="pl-8"
          />
        </div>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{labels.name}</TableHead>
                <TableHead>{labels.referrer}</TableHead>
                <TableHead>{labels.location}</TableHead>
                <TableHead>{labels.os}</TableHead>
                <TableHead>{labels.browser}</TableHead>
                <TableHead>{labels.device}</TableHead>
                <TableHead>{labels.firstSeen}</TableHead>
                <TableHead className="text-right">{messages.common.sessions}</TableHead>
                <TableHead className="text-right">{messages.common.views}</TableHead>
                <TableHead className="w-8 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                    {messages.common.loading}
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                    {labels.loadError}
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                    {labels.empty}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => {
                  const href = `${pathname}/detail?visitorId=${encodeURIComponent(row.visitorId)}`;
                  return (
                    <TableRow key={row.visitorId} className="group">
                      <TableCell className="pl-4">
                        <Link href={href} className="flex min-w-44 items-center gap-2">
                          <VisitorAvatar seed={row.visitorId} className="size-6" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{labels.anonymous}</span>
                            <span className="block truncate font-mono text-[11px] text-muted-foreground">
                              {shortId(row.visitorId)}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-56">
                        <ReferrerMeta
                          referrerHost={row.referrerHost || ""}
                          referrerUrl={row.referrerUrl}
                          directLabel={messages.overview.direct}
                        />
                      </TableCell>
                      <TableCell className="max-w-56">
                        <LocationMeta
                          locale={locale}
                          messages={messages}
                          country={row.country || ""}
                          region={row.region}
                          city={row.city}
                        />
                      </TableCell>
                      <TableCell className="max-w-44">
                        <OsMeta
                          os={row.os || ""}
                          version={row.osVersion}
                          unknownLabel={messages.common.unknown}
                        />
                      </TableCell>
                      <TableCell className="max-w-44">
                        <BrowserMeta
                          browser={row.browser || ""}
                          version={row.browserVersion}
                          unknownLabel={messages.common.unknown}
                        />
                      </TableCell>
                      <TableCell className="max-w-36">
                        <DeviceMeta
                          deviceType={row.deviceType || ""}
                          unknownLabel={messages.common.unknown}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {formatRelativeTime(locale, row.firstSeenAt, now)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {numberFormat(locale, row.sessions)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {numberFormat(locale, row.views)}
                      </TableCell>
                      <TableCell className="pr-4 text-right text-muted-foreground">
                        <Link href={href} aria-label={labels.activity}>
                          <RiArrowRightSLine className="ml-auto size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
