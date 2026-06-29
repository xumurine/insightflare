"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RiAddLine,
  RiArrowDownLine,
  RiArrowRightSLine,
  RiArrowUpLine,
  RiDeleteBinLine,
  RiLockLine,
} from "@remixicon/react";
import { motion } from "motion/react";
import { toast } from "sonner";

import { useDashboardQuery } from "@/components/dashboard/dashboard-query-provider";
import { DataTableSwitch } from "@/components/dashboard/data-table-switch";
import { PageHeading } from "@/components/dashboard/page-heading";
import { SiteBrandIcon } from "@/components/dashboard/site-brand-icon";
import {
  SiteTrafficStackChart,
  TrafficPairBarChart,
} from "@/components/dashboard/site-traffic-charts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AutoTransition } from "@/components/ui/auto-transition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clickable } from "@/components/ui/clickable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import {
  durationFormat,
  intlLocale,
  numberFormat,
  percentFormat,
  shortDateTime,
} from "@/lib/dashboard/format";
import { canAdministerTeam, canManageTeam } from "@/lib/dashboard/permissions";
import type { TimeWindow } from "@/lib/dashboard/query-state";
import {
  addZonedInterval,
  startOfZonedInterval,
} from "@/lib/dashboard/time-zone";
import type {
  MemberData,
  OverviewData,
  SiteData,
  TeamData,
} from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { navigateWithTransition } from "@/lib/page-transition";

type TeamTab = "sites" | "settings" | "members";

type SiteOverviewMetrics = OverviewData["data"];
type SiteMetricChangeRates = {
  views: number | null;
  visitors: number | null;
  sessions: number | null;
  bounceRate: number | null;
  avgDurationMs: number | null;
  pagesPerSession: number | null;
};

function emptyOverviewMetrics(): SiteOverviewMetrics {
  return {
    views: 0,
    sessions: 0,
    visitors: 0,
    bounces: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    bounceRate: 0,
    approximateVisitors: false,
  };
}

function emptySiteMetricChangeRates(): SiteMetricChangeRates {
  return {
    views: null,
    visitors: null,
    sessions: null,
    bounceRate: null,
    avgDurationMs: null,
    pagesPerSession: null,
  };
}

function normalizeChangeRate(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatChangeRate(value: number | null): string | null {
  if (value === null) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function changeRateClass(value: number | null, lowerIsBetter = false): string {
  if (value === null) return "text-muted-foreground";
  const isImprovement = lowerIsBetter ? value <= 0 : value >= 0;
  return isImprovement ? "text-emerald-600" : "text-rose-600";
}

function ChangeRateInline({
  value,
  lowerIsBetter = false,
}: {
  value: number | null;
  lowerIsBetter?: boolean;
}) {
  if (value === null) return null;
  const Icon = value >= 0 ? RiArrowUpLine : RiArrowDownLine;
  return (
    <span
      className={`inline-flex items-end gap-0.5 font-mono text-xs leading-none ${changeRateClass(value, lowerIsBetter)}`}
    >
      <Icon className="size-3.5" />
      {formatChangeRate(value)}
    </span>
  );
}

interface TeamManagementClientProps {
  locale: Locale;
  messages: AppMessages;
  activeTeam: TeamData;
  activeTab: TeamTab;
  systemRole: "admin" | "user";
  currentUserId: string;
}

function safeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getSiteSlug(site: SiteData): string {
  const domain = String(site.domain || "").trim();
  const candidate = safeSlug(domain);
  if (candidate.length > 0) return candidate;
  return site.id.slice(0, 8);
}

function withSiteSlug(site: SiteData): SiteData & { slug: string } {
  return {
    ...site,
    slug: getSiteSlug(site),
  };
}

function sortSitesForInitialOrder<
  T extends { id: string; name: string; overview?: SiteOverviewMetrics | null },
>(sites: T[]): T[] {
  return [...sites].sort((left, right) => {
    const leftViews = left.overview?.views ?? 0;
    const rightViews = right.overview?.views ?? 0;
    const byViews = rightViews - leftViews;
    if (byViews !== 0) return byViews;

    const leftVisitors = left.overview?.visitors ?? 0;
    const rightVisitors = right.overview?.visitors ?? 0;
    const byVisitors = rightVisitors - leftVisitors;
    if (byVisitors !== 0) return byVisitors;

    const byName = left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
      numeric: true,
    });
    if (byName !== 0) return byName;
    return left.id.localeCompare(right.id);
  });
}

function buildSitePath(
  locale: Locale,
  teamSlug: string,
  siteSlug: string,
): string {
  return `/${locale}/app/${teamSlug}/${siteSlug}`;
}

function intervalStepMs(interval: TimeWindow["interval"]): number {
  if (interval === "minute") return 60 * 1000;
  if (interval === "hour") return 60 * 60 * 1000;
  if (interval === "day") return 24 * 60 * 60 * 1000;
  if (interval === "week") return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

interface TeamDashboardTrendPoint {
  bucket: number;
  timestampMs: number;
  sites: Array<{
    siteId: string;
    views: number;
    visitors: number;
  }>;
}

interface TeamDashboardSite extends SiteData {
  overview: SiteOverviewMetrics;
  changeRates?: SiteMetricChangeRates;
}

interface TeamDashboardData {
  sites: TeamDashboardSite[];
  trend: TeamDashboardTrendPoint[];
}

const SITE_CARD_MAX_TREND_POINTS = 120;

async function fetchTeamDashboard(
  teamId: string,
  window: Pick<TimeWindow, "from" | "to" | "interval" | "timeZone">,
): Promise<TeamDashboardData> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
    const { handleDemoRequest } = await import("@/lib/realtime/mock");
    const result = handleDemoRequest({
      path: "/api/private/team-dashboard",
      params: {
        teamId,
        from: window.from,
        to: window.to,
        interval: window.interval,
        timeZone: window.timeZone,
      },
    }) as {
      ok: boolean;
      data?: { sites?: TeamDashboardSite[]; trend?: TeamDashboardTrendPoint[] };
    };
    return {
      sites: Array.isArray(result.data?.sites) ? result.data.sites : [],
      trend: Array.isArray(result.data?.trend) ? result.data.trend : [],
    };
  }
  const params = new URLSearchParams({
    teamId,
    from: String(window.from),
    to: String(window.to),
    interval: window.interval,
    timeZone: window.timeZone,
  });
  const response = await fetch(
    `/api/private/team-dashboard?${params.toString()}`,
    {
      method: "GET",
      credentials: "include",
    },
  );
  if (!response.ok) throw new Error("fetch_team_dashboard_failed");
  const payload = (await response.json()) as {
    ok: boolean;
    data?: {
      sites?: TeamDashboardSite[];
      trend?: TeamDashboardTrendPoint[];
    };
  };
  if (!payload.ok || !payload.data) {
    throw new Error("fetch_team_dashboard_failed");
  }
  return {
    sites: Array.isArray(payload.data.sites) ? payload.data.sites : [],
    trend: Array.isArray(payload.data.trend) ? payload.data.trend : [],
  };
}

async function fetchTeamMembers(teamId: string): Promise<MemberData[]> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
    const { handleDemoRequest } = await import("@/lib/realtime/mock");
    const result = handleDemoRequest({
      path: "/api/private/admin/members",
      params: { teamId },
    }) as { ok: boolean; data?: MemberData[] };
    return Array.isArray(result.data) ? result.data : [];
  }
  const url = `/api/private/admin/members?teamId=${encodeURIComponent(teamId)}`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("fetch_team_members_failed");
  const payload = (await response.json()) as {
    ok: boolean;
    data?: MemberData[];
  };
  return Array.isArray(payload.data) ? payload.data : [];
}

interface ActionResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
    const { handleDemoRequest } = await import("@/lib/realtime/mock");
    const result = handleDemoRequest({
      path: url,
      method,
      body,
    }) as ActionResponse<T>;
    return (result.data ?? {}) as T;
  }
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ActionResponse<T>;
  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.message || payload.error || "request_failed");
  }
  return payload.data;
}

export function TeamManagementClient({
  locale,
  messages,
  activeTeam,
  activeTab,
  systemRole,
  currentUserId,
}: TeamManagementClientProps) {
  const router = useRouter();
  const { window } = useDashboardQuery();
  const copy = messages.teamManagement;
  const siteCreateCopy = messages.adminSites;
  const [sites, setSites] = useState<Array<SiteData & { slug: string }>>([]);
  const [siteOrder, setSiteOrder] = useState<string[]>([]);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [createSiteDialogOpen, setCreateSiteDialogOpen] = useState(false);
  const [createSiteName, setCreateSiteName] = useState("");
  const [createSiteDomain, setCreateSiteDomain] = useState("");
  const [createSitePublicSlug, setCreateSitePublicSlug] = useState("");
  const [createSiteError, setCreateSiteError] = useState("");
  const [creatingSite, setCreatingSite] = useState(false);
  const [currentTeamName, setCurrentTeamName] = useState(activeTeam.name);
  const [teamName, setTeamName] = useState(activeTeam.name);
  const [teamSlug, setTeamSlug] = useState(activeTeam.slug);
  const [memberIdentifier, setMemberIdentifier] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);
  const [deletingTeam, setDeletingTeam] = useState(false);
  const [deleteTeamDialogOpen, setDeleteTeamDialogOpen] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const [addRole, setAddRole] = useState<"admin" | "member">("member");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [siteOverviewById, setSiteOverviewById] = useState<
    Record<string, SiteOverviewMetrics>
  >({});
  const [siteChangeRatesById, setSiteChangeRatesById] = useState<
    Record<string, SiteMetricChangeRates>
  >({});
  const [teamTrend, setTeamTrend] = useState<TeamDashboardTrendPoint[]>([]);
  const [transferTargetId, setTransferTargetId] = useState<string>("");
  const [transferring, setTransferring] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [chartWindow, setChartWindow] = useState<
    Pick<TimeWindow, "from" | "to" | "interval" | "timeZone">
  >(() => ({
    from: window.from,
    to: window.to,
    interval: window.interval,
    timeZone: window.timeZone,
  }));
  const canManage = canManageTeam(activeTeam.membershipRole, systemRole);
  const canAdminister = canAdministerTeam(
    activeTeam.membershipRole,
    systemRole,
  );
  const canManageSites = canManage;
  const isRealOwner = activeTeam.ownerUserId === currentUserId;
  const transferableMembers = useMemo(
    () => members.filter((m) => m.userId !== activeTeam.ownerUserId),
    [members, activeTeam.ownerUserId],
  );

  useEffect(() => {
    if (activeTab !== "settings" && activeTab !== "members") return;
    let active = true;
    setLoading(true);

    fetchTeamMembers(activeTeam.id)
      .then((nextMembers) => {
        if (!active) return;
        setMembers(nextMembers);
      })
      .catch(() => {
        if (!active) return;
        setMembers([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeTeam.id, activeTab]);

  useEffect(() => {
    setCreateSiteDialogOpen(false);
    setCreateSiteName("");
    setCreateSiteDomain("");
    setCreateSitePublicSlug("");
    setCreateSiteError("");
    setCurrentTeamName(activeTeam.name);
    setTeamName(activeTeam.name);
    setTeamSlug(activeTeam.slug);
    setMemberIdentifier("");
    setSites([]);
    setSiteOrder([]);
    setMembers([]);
    setSiteOverviewById({});
    setSiteChangeRatesById({});
    setTeamTrend([]);
    setTransferTargetId("");
    setTransferDialogOpen(false);
    setChartWindow({
      from: window.from,
      to: window.to,
      interval: window.interval,
      timeZone: window.timeZone,
    });
  }, [activeTeam.id, activeTeam.name, activeTeam.slug]);

  useEffect(() => {
    if (activeTab !== "sites") return;

    let active = true;
    setLoading(true);
    setAnalyticsLoading(true);

    fetchTeamDashboard(activeTeam.id, window)
      .then((dashboard) => {
        if (!active) return;
        const nextSites = dashboard.sites.map(withSiteSlug);
        const sortedSites = sortSitesForInitialOrder(dashboard.sites);
        setSites(nextSites);
        setSiteOrder((currentOrder) => {
          const nextIds = sortedSites.map((site) => site.id);
          if (currentOrder.length === 0) return nextIds;
          const knownIds = new Set(currentOrder);
          const appended = nextIds.filter((id) => !knownIds.has(id));
          if (appended.length === 0) return currentOrder;
          return [...currentOrder, ...appended];
        });
        setSiteOverviewById(
          Object.fromEntries(
            dashboard.sites.map((site) => [
              site.id,
              site.overview ?? emptyOverviewMetrics(),
            ]),
          ),
        );
        setSiteChangeRatesById(
          Object.fromEntries(
            dashboard.sites.map((site) => [
              site.id,
              {
                views: normalizeChangeRate(site.changeRates?.views),
                visitors: normalizeChangeRate(site.changeRates?.visitors),
                sessions: normalizeChangeRate(site.changeRates?.sessions),
                bounceRate: normalizeChangeRate(site.changeRates?.bounceRate),
                avgDurationMs: normalizeChangeRate(
                  site.changeRates?.avgDurationMs,
                ),
                pagesPerSession: normalizeChangeRate(
                  site.changeRates?.pagesPerSession,
                ),
              },
            ]),
          ),
        );
        setTeamTrend(dashboard.trend);
        setChartWindow({
          from: window.from,
          to: window.to,
          interval: window.interval,
          timeZone: window.timeZone,
        });
      })
      .catch(() => {
        if (!active) return;
        setSites([]);
        setSiteOverviewById({});
        setSiteChangeRatesById({});
        setTeamTrend([]);
        setChartWindow({
          from: window.from,
          to: window.to,
          interval: window.interval,
          timeZone: window.timeZone,
        });
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setAnalyticsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    activeTeam.id,
    activeTab,
    window.from,
    window.to,
    window.interval,
    window.timeZone,
  ]);

  useEffect(() => {
    if (activeTab === "sites" || activeTab === "settings") return;
    setLoading(false);
    setAnalyticsLoading(false);
  }, [activeTab]);

  async function refreshMembers() {
    const nextMembers = await fetchTeamMembers(activeTeam.id);
    setMembers(nextMembers);
  }

  async function handleCreateSite() {
    const team = activeTeam;
    const name = createSiteName.trim();
    const domain = createSiteDomain.trim();
    const publicSlug = createSitePublicSlug.trim();

    if (!team?.id) return;
    if (name.length < 2 || domain.length < 3) {
      setCreateSiteError(siteCreateCopy.invalidInput);
      toast.error(siteCreateCopy.invalidInput);
      return;
    }

    setCreatingSite(true);
    setCreateSiteError("");
    try {
      const created = await postJson<SiteData>("/api/private/admin/sites", {
        teamId: team.id,
        name,
        domain,
        publicSlug: publicSlug || undefined,
      });
      setCreateSiteDialogOpen(false);
      setCreateSiteName("");
      setCreateSiteDomain("");
      setCreateSitePublicSlug("");
      toast.success(siteCreateCopy.createSuccess);
      navigateWithTransition(
        router,
        `${buildSitePath(locale, team.slug, getSiteSlug(created))}/settings`,
      );
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : siteCreateCopy.createFailed;
      setCreateSiteError(message || siteCreateCopy.createFailed);
      toast.error(message || siteCreateCopy.createFailed);
    } finally {
      setCreatingSite(false);
    }
  }

  async function handleSaveTeamSettings() {
    const name = teamName.trim();
    const slug = teamSlug.trim();
    if (name.length < 2) {
      toast.error(copy.toasts.invalidTeamName);
      return;
    }

    setSavingTeam(true);
    try {
      const updated = await postJson<TeamData>(
        "/api/private/admin/teams",
        {
          teamId: activeTeam.id,
          name,
          slug: slug || undefined,
        },
        "PATCH",
      );
      setCurrentTeamName(updated.name);
      setTeamName(updated.name);
      setTeamSlug(updated.slug);
      toast.success(copy.toasts.teamSaved);

      if (updated.slug !== activeTeam.slug) {
        navigateWithTransition(router, `/${locale}/app/${updated.slug}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : copy.toasts.teamSaveFailed;
      toast.error(message || copy.toasts.teamSaveFailed);
    } finally {
      setSavingTeam(false);
    }
  }

  async function handleAddMember() {
    const identifier = memberIdentifier.trim();
    if (identifier.length < 2) {
      toast.error(copy.toasts.invalidMemberIdentifier);
      return;
    }

    setAddingMember(true);
    try {
      await postJson("/api/private/admin/members", {
        teamId: activeTeam.id,
        identifier,
        role: addRole,
      });
      setMemberIdentifier("");
      setAddRole("member");
      await refreshMembers();
      toast.success(copy.toasts.memberAdded);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : copy.toasts.memberAddFailed;
      toast.error(message || copy.toasts.memberAddFailed);
    } finally {
      setAddingMember(false);
    }
  }

  async function handleDeleteTeam() {
    setDeletingTeam(true);
    try {
      await postJson(
        "/api/private/admin/teams",
        {
          intent: "remove",
          teamId: activeTeam.id,
        },
        "PATCH",
      );
      toast.success(copy.toasts.teamDeleted);
      setDeleteTeamDialogOpen(false);
      navigateWithTransition(router, `/${locale}/app`);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : copy.toasts.teamDeleteFailed;
      toast.error(message || copy.toasts.teamDeleteFailed);
    } finally {
      setDeletingTeam(false);
    }
  }

  async function handleTransferOwner() {
    if (!transferTargetId) {
      toast.error(copy.toasts.invalidTransferTarget);
      return;
    }
    setTransferring(true);
    try {
      await postJson<TeamData>(
        "/api/private/admin/teams",
        {
          intent: "transfer_owner",
          teamId: activeTeam.id,
          newOwnerUserId: transferTargetId,
        },
        "PATCH",
      );
      toast.success(copy.toasts.ownerTransferred);
      setTransferDialogOpen(false);
      setTransferTargetId("");
      await refreshMembers();
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : copy.toasts.ownerTransferFailed;
      toast.error(message || copy.toasts.ownerTransferFailed);
    } finally {
      setTransferring(false);
    }
  }

  async function handleChangeMemberRole(
    userId: string,
    nextRole: "admin" | "member",
  ) {
    setChangingRoleId(userId);
    try {
      await postJson(
        "/api/private/admin/members",
        {
          intent: "update_role",
          teamId: activeTeam.id,
          userId,
          role: nextRole,
        },
        "PATCH",
      );
      await refreshMembers();
      toast.success(copy.toasts.roleChanged);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : copy.toasts.roleChangeFailed;
      toast.error(message || copy.toasts.roleChangeFailed);
    } finally {
      setChangingRoleId(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    setRemovingMemberId(userId);
    try {
      await postJson(
        "/api/private/admin/members",
        {
          intent: "remove",
          teamId: activeTeam.id,
          userId,
        },
        "PATCH",
      );
      await refreshMembers();
      toast.success(copy.toasts.memberRemoved);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : copy.toasts.memberRemoveFailed;
      toast.error(message || copy.toasts.memberRemoveFailed);
    } finally {
      setRemovingMemberId(null);
    }
  }

  const aggregateChartRenderData = useMemo(() => {
    const timeline = new Map<
      number,
      {
        timestampMs: number;
        sites: Map<string, { views: number; visitors: number }>;
      }
    >();
    const end = startOfZonedInterval(
      chartWindow.to,
      chartWindow.interval,
      chartWindow.timeZone,
    );
    let current = startOfZonedInterval(
      chartWindow.from,
      chartWindow.interval,
      chartWindow.timeZone,
    );
    const hardLimit = 2000;

    for (let index = 0; index < hardLimit && current <= end; index += 1) {
      timeline.set(current, {
        timestampMs: current,
        sites: new Map(),
      });
      let next = addZonedInterval(
        current,
        chartWindow.interval,
        chartWindow.timeZone,
      );
      if (!Number.isFinite(next) || next <= current) {
        next = current + intervalStepMs(chartWindow.interval);
      }
      current = next;
    }

    for (const point of teamTrend) {
      const bucket = startOfZonedInterval(
        Number(point.timestampMs ?? 0),
        chartWindow.interval,
        chartWindow.timeZone,
      );
      const current = timeline.get(bucket) ?? {
        timestampMs: bucket,
        sites: new Map<string, { views: number; visitors: number }>(),
      };

      for (const sitePoint of point.sites) {
        const previous = current.sites.get(sitePoint.siteId) ?? {
          views: 0,
          visitors: 0,
        };
        current.sites.set(sitePoint.siteId, {
          views: previous.views + (sitePoint.views ?? 0),
          visitors: previous.visitors + (sitePoint.visitors ?? 0),
        });
      }
      timeline.set(bucket, current);
    }

    return Array.from(timeline.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([, value]) => ({
        timestampMs: value.timestampMs,
        sites: Array.from(value.sites.entries()).map(([siteId, siteValue]) => ({
          siteId,
          views: siteValue.views,
          visitors: siteValue.visitors,
        })),
      }));
  }, [
    teamTrend,
    chartWindow.from,
    chartWindow.to,
    chartWindow.interval,
    chartWindow.timeZone,
  ]);

  const siteTrendById = useMemo(() => {
    const siteBuckets = new Map<
      string,
      Map<number, { timestampMs: number; views: number; visitors: number }>
    >();
    const starts: number[] = [];
    const end = startOfZonedInterval(
      chartWindow.to,
      chartWindow.interval,
      chartWindow.timeZone,
    );
    let current = startOfZonedInterval(
      chartWindow.from,
      chartWindow.interval,
      chartWindow.timeZone,
    );
    const hardLimit = 2000;
    for (let index = 0; index < hardLimit && current <= end; index += 1) {
      starts.push(current);
      let next = addZonedInterval(
        current,
        chartWindow.interval,
        chartWindow.timeZone,
      );
      if (!Number.isFinite(next) || next <= current) {
        next = current + intervalStepMs(chartWindow.interval);
      }
      current = next;
    }

    for (const site of sites) {
      const bucketMap = new Map<
        number,
        { timestampMs: number; views: number; visitors: number }
      >();
      for (const start of starts) {
        bucketMap.set(start, {
          timestampMs: start,
          views: 0,
          visitors: 0,
        });
      }
      siteBuckets.set(site.id, bucketMap);
    }

    for (const point of teamTrend) {
      const bucket = startOfZonedInterval(
        Number(point.timestampMs ?? 0),
        chartWindow.interval,
        chartWindow.timeZone,
      );

      for (const sitePoint of point.sites) {
        const bucketMap = siteBuckets.get(sitePoint.siteId);
        if (!bucketMap) continue;
        const existing = bucketMap.get(bucket) ?? {
          timestampMs: bucket,
          views: 0,
          visitors: 0,
        };
        existing.views += sitePoint.views ?? 0;
        existing.visitors += sitePoint.visitors ?? 0;
        bucketMap.set(bucket, existing);
      }
    }

    return Object.fromEntries(
      Array.from(siteBuckets.entries()).map(([siteId, bucketMap]) => [
        siteId,
        Array.from(bucketMap.entries())
          .sort((left, right) => left[0] - right[0])
          .map(([, value]) => value),
      ]),
    );
  }, [
    sites,
    teamTrend,
    chartWindow.from,
    chartWindow.to,
    chartWindow.interval,
    chartWindow.timeZone,
  ]);

  const siteDashboardCards = useMemo(() => {
    const cards = sites.map((site) => {
      const overview = siteOverviewById[site.id] ?? emptyOverviewMetrics();
      const pagesPerSession =
        overview.sessions > 0 ? overview.views / overview.sessions : 0;
      return {
        site,
        overview,
        pagesPerSession,
        changeRates:
          siteChangeRatesById[site.id] ?? emptySiteMetricChangeRates(),
        trend: siteTrendById[site.id] ?? [],
      };
    });

    if (siteOrder.length === 0) return cards;

    const cardById = new Map(cards.map((card) => [card.site.id, card]));
    const orderedCards = [] as typeof cards;

    for (const siteId of siteOrder) {
      const card = cardById.get(siteId);
      if (!card) continue;
      orderedCards.push(card);
      cardById.delete(siteId);
    }

    if (cardById.size > 0) {
      orderedCards.push(...Array.from(cardById.values()));
    }

    return orderedCards;
  }, [sites, siteOverviewById, siteChangeRatesById, siteTrendById, siteOrder]);
  const aggregateChartSites = useMemo(
    () =>
      siteDashboardCards.map(({ site }) => ({
        id: site.id,
        name: site.name,
      })),
    [siteDashboardCards],
  );

  const pagesPerSessionFormatter = useMemo(
    () =>
      new Intl.NumberFormat(intlLocale(locale), {
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  const siteCount = useMemo(
    () => (activeTab === "sites" ? sites.length : activeTeam.siteCount),
    [activeTab, sites.length, activeTeam.siteCount],
  );

  const memberCount = useMemo(
    () =>
      activeTab === "settings" || activeTab === "members"
        ? members.length
        : activeTeam.memberCount,
    [activeTab, members.length, activeTeam.memberCount],
  );

  const panelTitle =
    activeTab === "sites"
      ? copy.sites.title
      : activeTab === "settings"
        ? copy.settings.title
        : copy.members.title;
  const panelSubtitle =
    activeTab === "sites"
      ? copy.sites.subtitle
      : activeTab === "settings"
        ? copy.settings.subtitle
        : copy.members.subtitle;
  const isSitesChartsLoading =
    activeTab === "sites" && (loading || analyticsLoading);
  const memberManagementSection = (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{copy.members.title}</CardTitle>
          <CardDescription>{copy.members.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAddMember();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="member-identifier">
                {copy.members.identifierLabel}
              </Label>
              <Input
                id="member-identifier"
                value={memberIdentifier}
                onChange={(event) => setMemberIdentifier(event.target.value)}
                placeholder={copy.members.identifierPlaceholder}
                minLength={2}
                required
                disabled={!canManage}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-add-role">
                {copy.members.columns.role}
              </Label>
              <Select
                value={addRole}
                onValueChange={(value) => {
                  setAddRole(value === "admin" ? "admin" : "member");
                }}
                disabled={!canManage}
              >
                <SelectTrigger id="member-add-role" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">
                    {copy.members.roleLabels.member}
                  </SelectItem>
                  <SelectItem value="admin">
                    {copy.members.roleLabels.admin}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={addingMember || !canManage}>
              <AutoTransition className="inline-flex items-center gap-2">
                {addingMember ? (
                  <span key="adding" className="inline-flex items-center gap-2">
                    <Spinner className="size-4" />
                    {copy.members.adding}
                  </span>
                ) : (
                  <span key="add">{copy.members.add}</span>
                )}
              </AutoTransition>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <DataTableSwitch
            loading={loading}
            hasContent={members.length > 0}
            loadingLabel={messages.common.loading}
            emptyLabel={copy.members.noMembers}
            colSpan={6}
            header={
              <TableRow>
                <TableHead>{copy.members.columns.name}</TableHead>
                <TableHead>{copy.members.columns.username}</TableHead>
                <TableHead>{copy.members.columns.email}</TableHead>
                <TableHead>{copy.members.columns.role}</TableHead>
                <TableHead>{copy.members.columns.joinedAt}</TableHead>
                <TableHead className="text-right">
                  {copy.members.columns.action}
                </TableHead>
              </TableRow>
            }
            rows={members.map((member) => (
              <TableRow key={member.userId}>
                <TableCell className="font-medium">
                  {member.name || member.username}
                </TableCell>
                <TableCell>{member.username}</TableCell>
                <TableCell>{member.email}</TableCell>
                <TableCell>
                  {member.role === "owner" ? (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <RiLockLine className="size-3.5" />
                      {copy.members.roleLabels.owner}
                    </span>
                  ) : (
                    <Select
                      value={member.role === "admin" ? "admin" : "member"}
                      disabled={!canManage || changingRoleId === member.userId}
                      onValueChange={(value) => {
                        const next: "admin" | "member" =
                          value === "admin" ? "admin" : "member";
                        const current: "admin" | "member" =
                          member.role === "admin" ? "admin" : "member";
                        if (next === current) return;
                        const isSelfDemote =
                          member.userId === currentUserId &&
                          systemRole !== "admin" &&
                          activeTeam.ownerUserId !== currentUserId &&
                          next === "member";
                        if (isSelfDemote) {
                          toast.error(copy.toasts.roleChangeFailed);
                          return;
                        }
                        void handleChangeMemberRole(member.userId, next);
                      }}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <AutoTransition className="inline-flex items-center gap-1.5">
                          {changingRoleId === member.userId ? (
                            <span
                              key="role-changing"
                              className="inline-flex items-center gap-1.5"
                            >
                              <Spinner className="size-3" />
                            </span>
                          ) : (
                            <span key="role-value">
                              <SelectValue />
                            </span>
                          )}
                        </AutoTransition>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">
                          {copy.members.roleLabels.member}
                        </SelectItem>
                        <SelectItem value="admin">
                          {copy.members.roleLabels.admin}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  {shortDateTime(locale, member.joinedAt, window.timeZone)}
                </TableCell>
                <TableCell className="text-right">
                  {member.role === "owner" ? null : (
                    <Clickable
                      onClick={() => {
                        void handleRemoveMember(member.userId);
                      }}
                      disabled={
                        !canManage || removingMemberId === member.userId
                      }
                      className="size-6 text-destructive/80 hover:text-destructive"
                      aria-label={copy.members.remove}
                      title={copy.members.remove}
                    >
                      <AutoTransition className="inline-flex items-center justify-center">
                        {removingMemberId === member.userId ? (
                          <span
                            key="removing"
                            className="inline-flex items-center justify-center"
                          >
                            <Spinner className="size-3.5" />
                          </span>
                        ) : (
                          <span
                            key="remove"
                            className="inline-flex items-center justify-center"
                          >
                            <RiDeleteBinLine className="size-4" />
                          </span>
                        )}
                      </AutoTransition>
                    </Clickable>
                  )}
                </TableCell>
              </TableRow>
            ))}
          />
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeading
        title={`${panelTitle} · ${currentTeamName}`}
        subtitle={panelSubtitle}
        actions={
          <>
            <Badge variant="outline">
              <span className="inline-flex items-center gap-1.5">
                {copy.stats.sites}:
                <AutoTransition initial className="inline-flex items-center">
                  {loading ? (
                    <span
                      key="sites-loading"
                      className="inline-flex items-center"
                    >
                      <Spinner className="size-3.5" />
                    </span>
                  ) : (
                    <span key="sites-value">{siteCount}</span>
                  )}
                </AutoTransition>
              </span>
            </Badge>
            <Badge variant="outline">
              <span className="inline-flex items-center gap-1.5">
                {copy.stats.members}:
                <AutoTransition initial className="inline-flex items-center">
                  {loading ? (
                    <span
                      key="members-loading"
                      className="inline-flex items-center"
                    >
                      <Spinner className="size-3.5" />
                    </span>
                  ) : (
                    <span key="members-value">{memberCount}</span>
                  )}
                </AutoTransition>
              </span>
            </Badge>
            {activeTab === "sites" && canManageSites ? (
              <Button
                type="button"
                onClick={() => {
                  setCreateSiteName("");
                  setCreateSiteDomain("");
                  setCreateSitePublicSlug("");
                  setCreateSiteError("");
                  setCreateSiteDialogOpen(true);
                }}
              >
                <RiAddLine />
                <span>{siteCreateCopy.create}</span>
              </Button>
            ) : null}
          </>
        }
      />

      <Dialog
        open={createSiteDialogOpen}
        onOpenChange={(next) => {
          if (!next && creatingSite) return;
          setCreateSiteDialogOpen(next);
          if (!next) {
            setCreateSiteError("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{siteCreateCopy.createTitle}</DialogTitle>
            <DialogDescription>
              {siteCreateCopy.createSubtitle}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateSite();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="team-dashboard-create-site-name">
                {siteCreateCopy.name}
              </Label>
              <Input
                id="team-dashboard-create-site-name"
                value={createSiteName}
                onChange={(event) => setCreateSiteName(event.target.value)}
                minLength={2}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team-dashboard-create-site-domain">
                {siteCreateCopy.domain}
              </Label>
              <Input
                id="team-dashboard-create-site-domain"
                value={createSiteDomain}
                onChange={(event) => setCreateSiteDomain(event.target.value)}
                minLength={3}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team-dashboard-create-site-public-slug">
                {siteCreateCopy.publicSlug}
              </Label>
              <Input
                id="team-dashboard-create-site-public-slug"
                value={createSitePublicSlug}
                onChange={(event) =>
                  setCreateSitePublicSlug(event.target.value)
                }
              />
            </div>

            {createSiteError ? (
              <p className="text-xs text-destructive">{createSiteError}</p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateSiteDialogOpen(false)}
                disabled={creatingSite}
              >
                {messages.teamSelect.cancel}
              </Button>
              <Button type="submit" disabled={creatingSite}>
                <AutoTransition className="inline-flex items-center gap-2">
                  {creatingSite ? (
                    <span
                      key="creating-site"
                      className="inline-flex items-center gap-2"
                    >
                      <Spinner className="size-4" />
                      {siteCreateCopy.creating}
                    </span>
                  ) : (
                    <span key="create-site">{siteCreateCopy.create}</span>
                  )}
                </AutoTransition>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {activeTab === "sites" ? (
          <div className="space-y-4">
            <Card className="overflow-visible">
              <CardHeader>
                <CardTitle>{copy.sites.aggregateTitle}</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="relative">
                  <SiteTrafficStackChart
                    data={aggregateChartRenderData}
                    sites={aggregateChartSites}
                    locale={locale}
                    timeZone={chartWindow.timeZone}
                    interval={chartWindow.interval}
                    viewsLabel={messages.common.views}
                    visitorsLabel={messages.common.visitors}
                    messages={messages}
                    loading={isSitesChartsLoading}
                    className={isSitesChartsLoading ? "opacity-40" : undefined}
                  />
                  <AutoTransition
                    type="fade"
                    duration={0.22}
                    className="pointer-events-none absolute inset-0"
                  >
                    {isSitesChartsLoading ? (
                      <div
                        key="aggregate-overlay-loading"
                        className="flex h-full w-full items-center justify-center bg-background/50 text-sm text-muted-foreground"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Spinner className="size-4" />
                          {messages.common.loading}
                        </span>
                      </div>
                    ) : (
                      <div
                        key="aggregate-overlay-idle"
                        className="h-full w-full bg-transparent"
                      />
                    )}
                  </AutoTransition>
                </div>

                {!loading && !analyticsLoading && sites.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {copy.sites.noSites}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            {sites.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {siteDashboardCards.map(
                  ({ site, overview, pagesPerSession, changeRates, trend }) => (
                    <Link
                      key={site.id}
                      href={buildSitePath(locale, activeTeam.slug, site.slug)}
                      className="group block h-full outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                      aria-label={`${copy.sites.openAnalytics}: ${site.name}`}
                      title={copy.sites.openAnalytics}
                    >
                      <motion.div
                        className="h-full"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.994 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                      >
                        <Card className="h-full transition-colors group-hover:bg-accent/20">
                          <CardHeader className="space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <div className="min-w-0 space-y-1">
                                  <CardTitle className="truncate text-base flex items-center gap-2">
                                    <SiteBrandIcon
                                      siteId={site.id}
                                      siteName={site.name}
                                      domain={site.domain}
                                      iconSrc={site.iconPath}
                                      size="md"
                                    />
                                    {site.name}
                                  </CardTitle>
                                  <CardDescription className="truncate font-mono text-xs">
                                    {site.domain}
                                  </CardDescription>
                                </div>
                              </div>
                              <span className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground">
                                <RiArrowRightSLine className="size-4" />
                              </span>
                            </div>
                          </CardHeader>

                          <CardContent className="space-y-4">
                            <AutoTransition
                              type="fade"
                              duration={0.24}
                              className="w-full"
                            >
                              <div key={`site-chart-${site.id}`}>
                                <TrafficPairBarChart
                                  data={trend}
                                  locale={locale}
                                  timeZone={chartWindow.timeZone}
                                  interval={chartWindow.interval}
                                  viewsLabel={messages.common.views}
                                  visitorsLabel={messages.common.visitors}
                                  messages={messages}
                                  maxPoints={SITE_CARD_MAX_TREND_POINTS}
                                />
                              </div>
                            </AutoTransition>

                            <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-[11px] sm:grid-cols-3">
                              <div className="space-y-1">
                                <p className="text-muted-foreground">
                                  {messages.common.views}
                                </p>
                                <p className="inline-flex items-end gap-1.5 font-mono text-base leading-none">
                                  {numberFormat(locale, overview.views)}
                                  <ChangeRateInline value={changeRates.views} />
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-muted-foreground">
                                  {messages.common.visitors}
                                </p>
                                <p className="inline-flex items-end gap-1.5 font-mono text-base leading-none">
                                  {numberFormat(locale, overview.visitors)}
                                  <ChangeRateInline
                                    value={changeRates.visitors}
                                  />
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-muted-foreground">
                                  {messages.common.sessions}
                                </p>
                                <p className="inline-flex items-end gap-1.5 font-mono text-base leading-none">
                                  {numberFormat(locale, overview.sessions)}
                                  <ChangeRateInline
                                    value={changeRates.sessions}
                                  />
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-muted-foreground">
                                  {messages.common.bounceRate}
                                </p>
                                <p className="inline-flex items-end gap-1.5 font-mono text-base leading-none">
                                  {percentFormat(locale, overview.bounceRate)}
                                  <ChangeRateInline
                                    value={changeRates.bounceRate}
                                    lowerIsBetter
                                  />
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-muted-foreground">
                                  {copy.sites.pagesPerSession}
                                </p>
                                <p className="inline-flex items-end gap-1.5 font-mono text-base leading-none">
                                  {pagesPerSessionFormatter.format(
                                    pagesPerSession,
                                  )}
                                  <ChangeRateInline
                                    value={changeRates.pagesPerSession}
                                  />
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-muted-foreground">
                                  {messages.common.avgDuration}
                                </p>
                                <p className="inline-flex items-end gap-1.5 font-mono text-base leading-none">
                                  {durationFormat(
                                    locale,
                                    overview.avgDurationMs,
                                  )}
                                  <ChangeRateInline
                                    value={changeRates.avgDurationMs}
                                  />
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    </Link>
                  ),
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "settings" ? (
          <div className="space-y-4">
            {memberManagementSection}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>{copy.settings.title}</CardTitle>
                  <CardDescription>{copy.settings.subtitle}</CardDescription>
                </CardHeader>
                <CardContent className="flex h-full flex-col">
                  <form
                    className="flex h-full flex-col gap-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSaveTeamSettings();
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="team-name">
                        {copy.settings.nameLabel}
                      </Label>
                      <Input
                        id="team-name"
                        value={teamName}
                        onChange={(event) => setTeamName(event.target.value)}
                        minLength={2}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="team-slug">
                        {copy.settings.slugLabel}
                      </Label>
                      <Input
                        id="team-slug"
                        value={teamSlug}
                        onChange={(event) => setTeamSlug(event.target.value)}
                      />
                    </div>

                    <Button
                      type="submit"
                      className="mt-auto self-start"
                      disabled={savingTeam || deletingTeam}
                    >
                      <AutoTransition className="inline-flex items-center gap-2">
                        {savingTeam ? (
                          <span
                            key="saving"
                            className="inline-flex items-center gap-2"
                          >
                            <Spinner className="size-4" />
                            {copy.settings.saving}
                          </span>
                        ) : (
                          <span key="save">{copy.settings.save}</span>
                        )}
                      </AutoTransition>
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {isRealOwner ? (
                <AlertDialog
                  open={transferDialogOpen}
                  onOpenChange={(open) => {
                    if (transferring) return;
                    setTransferDialogOpen(open);
                  }}
                >
                  <Card className="h-full border-amber-500/40">
                    <CardHeader>
                      <CardTitle>{copy.settings.transferTitle}</CardTitle>
                      <CardDescription>
                        {copy.settings.transferSubtitle}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex h-full flex-col gap-3">
                      {transferableMembers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {copy.settings.noTransferableMembers}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <Label htmlFor="transfer-target">
                            {copy.settings.transferTargetLabel}
                          </Label>
                          <Select
                            value={transferTargetId}
                            onValueChange={setTransferTargetId}
                            disabled={transferring}
                          >
                            <SelectTrigger
                              id="transfer-target"
                              className="w-full"
                            >
                              <SelectValue
                                placeholder={
                                  copy.settings.transferTargetPlaceholder
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {transferableMembers.map((member) => (
                                <SelectItem
                                  key={member.userId}
                                  value={member.userId}
                                >
                                  {member.name || member.username} ·{" "}
                                  {member.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="mt-auto flex pt-2">
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            disabled={
                              transferring ||
                              !transferTargetId ||
                              transferableMembers.length === 0
                            }
                          >
                            <AutoTransition className="inline-flex items-center gap-2">
                              {transferring ? (
                                <span
                                  key="transferring"
                                  className="inline-flex items-center gap-2"
                                >
                                  <Spinner className="size-4" />
                                  {copy.settings.transferring}
                                </span>
                              ) : (
                                <span key="transfer">
                                  {copy.settings.transfer}
                                </span>
                              )}
                            </AutoTransition>
                          </Button>
                        </AlertDialogTrigger>
                      </div>
                    </CardContent>
                  </Card>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {copy.settings.transferTitle}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {copy.settings.transferConfirm}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={transferring}>
                        {messages.teamSelect.cancel}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        disabled={transferring}
                        onClick={(event) => {
                          event.preventDefault();
                          void handleTransferOwner();
                        }}
                      >
                        <AutoTransition className="inline-flex items-center gap-2">
                          {transferring ? (
                            <span
                              key="transferring-dialog"
                              className="inline-flex items-center gap-2"
                            >
                              <Spinner className="size-4" />
                              {copy.settings.transferring}
                            </span>
                          ) : (
                            <span key="confirm-transfer-dialog">
                              {copy.settings.transfer}
                            </span>
                          )}
                        </AutoTransition>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}

              {canAdminister ? (
                <AlertDialog
                  open={deleteTeamDialogOpen}
                  onOpenChange={(open) => {
                    if (deletingTeam) return;
                    setDeleteTeamDialogOpen(open);
                  }}
                >
                  <Card className="h-full border-destructive/40">
                    <CardHeader>
                      <CardTitle>{copy.settings.delete}</CardTitle>
                      <CardDescription>
                        {copy.settings.deleteConfirm}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex h-full items-end">
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={savingTeam || deletingTeam}
                        >
                          <AutoTransition className="inline-flex items-center gap-2">
                            {deletingTeam ? (
                              <span
                                key="deleting"
                                className="inline-flex items-center gap-2"
                              >
                                <Spinner className="size-4" />
                                {copy.settings.deleting}
                              </span>
                            ) : (
                              <span key="delete">{copy.settings.delete}</span>
                            )}
                          </AutoTransition>
                        </Button>
                      </AlertDialogTrigger>
                    </CardContent>
                  </Card>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {copy.settings.delete}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {copy.settings.deleteConfirm}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deletingTeam}>
                        {messages.teamSelect.cancel}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        disabled={deletingTeam}
                        onClick={(event) => {
                          event.preventDefault();
                          void handleDeleteTeam();
                        }}
                      >
                        <AutoTransition className="inline-flex items-center gap-2">
                          {deletingTeam ? (
                            <span
                              key="deleting-dialog"
                              className="inline-flex items-center gap-2"
                            >
                              <Spinner className="size-4" />
                              {copy.settings.deleting}
                            </span>
                          ) : (
                            <span key="confirm-delete-dialog">
                              {copy.settings.delete}
                            </span>
                          )}
                        </AutoTransition>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === "members" ? (
          <div className="space-y-4">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>{copy.members.title}</CardTitle>
                <CardDescription>{copy.members.subtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleAddMember();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="member-identifier">
                      {copy.members.identifierLabel}
                    </Label>
                    <Input
                      id="member-identifier"
                      value={memberIdentifier}
                      onChange={(event) =>
                        setMemberIdentifier(event.target.value)
                      }
                      placeholder={copy.members.identifierPlaceholder}
                      minLength={2}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={addingMember}>
                    <AutoTransition className="inline-flex items-center gap-2">
                      {addingMember ? (
                        <span
                          key="adding"
                          className="inline-flex items-center gap-2"
                        >
                          <Spinner className="size-4" />
                          {copy.members.adding}
                        </span>
                      ) : (
                        <span key="add">{copy.members.add}</span>
                      )}
                    </AutoTransition>
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <DataTableSwitch
                  loading={loading}
                  hasContent={members.length > 0}
                  loadingLabel={messages.common.loading}
                  emptyLabel={copy.members.noMembers}
                  colSpan={6}
                  header={
                    <TableRow>
                      <TableHead>{copy.members.columns.name}</TableHead>
                      <TableHead>{copy.members.columns.username}</TableHead>
                      <TableHead>{copy.members.columns.email}</TableHead>
                      <TableHead>{copy.members.columns.role}</TableHead>
                      <TableHead>{copy.members.columns.joinedAt}</TableHead>
                      <TableHead className="text-right">
                        {copy.members.columns.action}
                      </TableHead>
                    </TableRow>
                  }
                  rows={members.map((member) => (
                    <TableRow key={member.userId}>
                      <TableCell className="font-medium">
                        {member.name || member.username}
                      </TableCell>
                      <TableCell>{member.username}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>{member.role}</TableCell>
                      <TableCell>
                        {shortDateTime(
                          locale,
                          member.joinedAt,
                          window.timeZone,
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Clickable
                          onClick={() => {
                            void handleRemoveMember(member.userId);
                          }}
                          disabled={removingMemberId === member.userId}
                          className="size-6 text-destructive/80 hover:text-destructive"
                          aria-label={copy.members.remove}
                          title={copy.members.remove}
                        >
                          <AutoTransition className="inline-flex items-center justify-center">
                            {removingMemberId === member.userId ? (
                              <span
                                key="removing"
                                className="inline-flex items-center justify-center"
                              >
                                <Spinner className="size-3.5" />
                              </span>
                            ) : (
                              <span
                                key="remove"
                                className="inline-flex items-center justify-center"
                              >
                                <RiDeleteBinLine className="size-4" />
                              </span>
                            )}
                          </AutoTransition>
                        </Clickable>
                      </TableCell>
                    </TableRow>
                  ))}
                />
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
