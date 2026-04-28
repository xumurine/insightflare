import "server-only";
import { cache } from "react";
import {
  fetchAdminMe,
  fetchAdminSites,
  type SiteData,
  type TeamData,
} from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";

export interface SiteWithSlug extends SiteData {
  slug: string;
}

export interface DashboardContext {
  user: {
    id: string;
    username: string;
    email: string;
    name: string;
    systemRole: "admin" | "user";
  };
  teams: TeamData[];
  activeTeam: TeamData;
  sites: SiteWithSlug[];
  activeSite: SiteWithSlug;
}

export interface DashboardTeamContext {
  user: {
    id: string;
    username: string;
    email: string;
    name: string;
    systemRole: "admin" | "user";
  };
  teams: TeamData[];
  activeTeam: TeamData;
  sites: SiteWithSlug[];
}

function safeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getSiteSlug(site: SiteData): string {
  const primary = String(site.publicSlug || "").trim();
  const domain = String(site.domain || "").trim();
  const name = String(site.name || "").trim();
  const candidate = safeSlug(primary || domain || name);
  if (candidate.length > 0) return candidate;
  return site.id.slice(0, 8);
}

function withSiteSlug(site: SiteData): SiteWithSlug {
  return {
    ...site,
    slug: getSiteSlug(site),
  };
}

function findSiteBySlug(sites: SiteWithSlug[], siteSlug: string): SiteWithSlug | null {
  const bySlug = sites.find((site) => site.slug === siteSlug);
  if (bySlug) return bySlug;
  const byId = sites.find((site) => site.id === siteSlug);
  return byId ?? null;
}

const getMe = cache(async () => {
  try {
    return await fetchAdminMe();
  } catch {
    return null;
  }
});

export const getDashboardProfile = cache(async () => {
  return getMe();
});

const getSitesForTeam = cache(async (teamId: string): Promise<SiteWithSlug[]> => {
  try {
    const sites = await fetchAdminSites(teamId);
    return sites.map(withSiteSlug);
  } catch {
    return [];
  }
});

export const getDashboardTeamContext = cache(
  async (teamSlug: string): Promise<DashboardTeamContext | null> => {
    const me = await getMe();
    if (!me) return null;

    const activeTeam = me.teams.find((team) => team.slug === teamSlug);
    if (!activeTeam) return null;

    const sites = await getSitesForTeam(activeTeam.id);

    return {
      user: me.user,
      teams: me.teams,
      activeTeam,
      sites,
    };
  },
);

export const getTeamSiteContext = cache(async (teamSlug: string, siteSlug: string): Promise<DashboardContext | null> => {
  const teamContext = await getDashboardTeamContext(teamSlug);
  if (!teamContext) return null;

  const activeSite = findSiteBySlug(teamContext.sites, siteSlug);
  if (!activeSite) return null;

  return {
    user: teamContext.user,
    teams: teamContext.teams,
    activeTeam: teamContext.activeTeam,
    sites: teamContext.sites,
    activeSite,
  };
});

export const getDefaultTeamSite = cache(async (): Promise<{ teamSlug: string; siteSlug: string } | null> => {
  const me = await getMe();
  if (!me || me.teams.length === 0) return null;

  const firstTeam = me.teams[0];
  const sites = await getSitesForTeam(firstTeam.id);
  if (sites.length === 0) {
    return null;
  }

  return {
    teamSlug: firstTeam.slug,
    siteSlug: sites[0].slug,
  };
});

export const getTeamDefaultSite = cache(async (teamSlug: string): Promise<{ teamSlug: string; siteSlug: string } | null> => {
  const me = await getMe();
  if (!me) return null;

  const activeTeam = me.teams.find((team) => team.slug === teamSlug);
  if (!activeTeam) return null;

  const sites = await getSitesForTeam(activeTeam.id);
  if (sites.length === 0) return null;

  return {
    teamSlug: activeTeam.slug,
    siteSlug: sites[0].slug,
  };
});

export function buildSitePath(
  locale: Locale,
  teamSlug: string,
  siteSlug: string,
  section?:
    | "realtime"
    | "pages"
    | "referrers"
    | "sessions"
    | "campaigns"
    | "events"
    | "funnels"
    | "visitors"
    | "retention"
    | "geo"
    | "devices"
    | "browsers"
    | "performance"
    | "settings",
): string {
  const base = `/${locale}/app/${teamSlug}/${siteSlug}`;
  if (!section) return base;
  return `${base}/${section}`;
}
