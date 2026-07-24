import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { publicDashboardSiteId } from "@/lib/dashboard/client-request";
import {
  getDashboardRootContext,
  getDashboardTeamContext,
  getTeamSiteContext,
} from "@/lib/dashboard/server";
import { fetchPublicSite } from "@/lib/edge-client";
import { fetchGithubReleases } from "@/lib/github-releases";

export const loadDashboardRoot = createServerFn({ method: "GET" }).handler(() =>
  getDashboardRootContext(),
);

export const loadDashboardTeam = createServerFn({ method: "GET" })
  .validator((data: { teamSlug: string }) => data)
  .handler(({ data }) => getDashboardTeamContext(data.teamSlug));

export const loadDashboardSite = createServerFn({ method: "GET" })
  .validator((data: { teamSlug: string; siteSlug: string }) => data)
  .handler(({ data }) => getTeamSiteContext(data.teamSlug, data.siteSlug));

export const loadShareSite = createServerFn({ method: "GET" })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    try {
      const site = await fetchPublicSite(data.slug);
      return { site, publicSiteId: publicDashboardSiteId(data.slug) };
    } catch {
      return null;
    }
  });

export const loadRequestOrigin = createServerFn({ method: "GET" }).handler(
  () => {
    const request = getRequest();
    const host =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (!host) return "";
    const proto =
      request.headers.get("x-forwarded-proto") ||
      (host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https");
    return `${proto}://${host}`;
  },
);

export const loadVersionReleases = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      return {
        releases: await fetchGithubReleases("RavelloH", "InsightFlare"),
        error: null,
      };
    } catch (error) {
      return {
        releases: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);
