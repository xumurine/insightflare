"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RiArrowRightSLine, RiSearchLine } from "@remixicon/react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { useDashboardQuery } from "@/components/dashboard/site-pages/use-dashboard-query";
import {
  BrowserMeta,
  DeviceMeta,
  formatDuration,
  formatPath,
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
import { fetchSessions } from "@/lib/dashboard/client-data";
import type { DashboardFilters, TimeWindow } from "@/lib/dashboard/query-state";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import type { JourneySession } from "@/lib/edge-client";

interface SessionsClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

const SESSION_LIMIT = 250;

function copy(locale: Locale) {
  return locale === "zh"
    ? {
        search: "搜索会话...",
        started: "开始",
        sessionId: "会话 ID",
        visitor: "访客",
        anonymous: "匿名访客",
        entryPage: "入口页面",
        exitPage: "退出页面",
        duration: "时长",
        bounce: "跳出",
        referrer: "来源",
        location: "地区",
        os: "系统",
        browser: "浏览器",
        device: "设备",
        pageViews: "页面浏览",
        yes: "是",
        no: "否",
        loadError: "无法加载会话数据。",
        empty: "当前时间范围内没有会话。",
      }
    : {
        search: "Search sessions...",
        started: "Started",
        sessionId: "Session ID",
        visitor: "Visitor",
        anonymous: "Anonymous",
        entryPage: "Entry Page",
        exitPage: "Exit Page",
        duration: "Duration",
        bounce: "Bounce",
        referrer: "Referrer",
        location: "Location",
        os: "OS",
        browser: "Browser",
        device: "Device",
        pageViews: "Page Views",
        yes: "Yes",
        no: "No",
        loadError: "Unable to load sessions.",
        empty: "No sessions in this time range.",
      };
}

function shortId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 9)}...`;
}

function matchesSession(row: JourneySession, query: string): boolean {
  if (!query) return true;
  const target = [
    row.sessionId,
    row.visitorId,
    row.entryPath,
    row.exitPath,
    row.referrerHost,
    row.referrerUrl,
    row.country,
    row.region,
    row.city,
    row.browser,
    row.os,
    row.deviceType,
  ].join(" ").toLocaleLowerCase();
  return target.includes(query.toLocaleLowerCase());
}

export function SessionsClientPage({
  locale,
  messages,
  siteId,
  pathname,
}: SessionsClientPageProps) {
  const labels = copy(locale);
  const { filters, window: timeWindow } = useDashboardQuery() as {
    filters: DashboardFilters;
    window: TimeWindow;
  };
  const [rows, setRows] = useState<JourneySession[]>([]);
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
    fetchSessions(siteId, timeWindow, filters, { limit: SESSION_LIMIT })
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
    () => rows.filter((row) => matchesSession(row, query.trim())),
    [query, rows],
  );

  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.sessions.title}
        subtitle={messages.sessions.subtitle}
      />

      <div className="relative w-full sm:max-w-xs">
        <RiSearchLine className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.search}
          className="pl-8"
        />
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{labels.started}</TableHead>
                <TableHead>{labels.sessionId}</TableHead>
                <TableHead>{labels.visitor}</TableHead>
                <TableHead>{labels.entryPage}</TableHead>
                <TableHead>{labels.exitPage}</TableHead>
                <TableHead>{labels.duration}</TableHead>
                <TableHead>{labels.bounce}</TableHead>
                <TableHead>{labels.referrer}</TableHead>
                <TableHead>{labels.location}</TableHead>
                <TableHead>{labels.os}</TableHead>
                <TableHead>{labels.browser}</TableHead>
                <TableHead>{labels.device}</TableHead>
                <TableHead className="text-right">{labels.pageViews}</TableHead>
                <TableHead className="w-8 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={14} className="h-28 text-center text-muted-foreground">
                    {messages.common.loading}
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={14} className="h-28 text-center text-muted-foreground">
                    {labels.loadError}
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="h-28 text-center text-muted-foreground">
                    {labels.empty}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => {
                  const href = `${pathname}/detail?sessionId=${encodeURIComponent(row.sessionId)}`;
                  return (
                    <TableRow key={row.sessionId} className="group">
                      <TableCell className="pl-4 font-mono text-muted-foreground">
                        {formatRelativeTime(locale, row.startedAt, now)}
                      </TableCell>
                      <TableCell>
                        <Link href={href} className="font-mono font-medium">
                          {shortId(row.sessionId)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-36 items-center gap-2">
                          <VisitorAvatar seed={row.visitorId} className="size-6" />
                          <span className="truncate">{labels.anonymous}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-56 truncate font-mono">
                        {formatPath(row.entryPath)}
                      </TableCell>
                      <TableCell className="max-w-56 truncate font-mono">
                        {formatPath(row.exitPath)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatDuration(locale, row.durationMs)}
                      </TableCell>
                      <TableCell className={row.bounce ? "text-amber-600" : "text-emerald-600"}>
                        {row.bounce ? labels.yes : labels.no}
                      </TableCell>
                      <TableCell className="max-w-48">
                        <ReferrerMeta
                          referrerHost={row.referrerHost}
                          referrerUrl={row.referrerUrl}
                          directLabel={messages.overview.direct}
                        />
                      </TableCell>
                      <TableCell className="max-w-52">
                        <LocationMeta
                          locale={locale}
                          messages={messages}
                          country={row.country}
                          region={row.region}
                          city={row.city}
                        />
                      </TableCell>
                      <TableCell className="max-w-40">
                        <OsMeta
                          os={row.os}
                          version={row.osVersion}
                          unknownLabel={messages.common.unknown}
                        />
                      </TableCell>
                      <TableCell className="max-w-40">
                        <BrowserMeta
                          browser={row.browser}
                          version={row.browserVersion}
                          unknownLabel={messages.common.unknown}
                        />
                      </TableCell>
                      <TableCell className="max-w-36">
                        <DeviceMeta
                          deviceType={row.deviceType}
                          unknownLabel={messages.common.unknown}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {numberFormat(locale, row.views)}
                      </TableCell>
                      <TableCell className="pr-4 text-right text-muted-foreground">
                        <Link href={href} aria-label={labels.sessionId}>
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
