import type { Env } from "@/lib/edge/types";

import { notFound, utmDimensionDefinition } from "./core";
import {
  handleEventRecordDetail,
  handleEventsRecords,
  handleEventsSummary,
  handleEventsTrend,
  handleEventTypeDetail,
  handleEventTypeFieldValues,
  handleEventTypes,
} from "./events";
import { handleFunnel } from "./funnels";
import {
  handleRetention,
  handleSessionDetail,
  handleSessions,
  handleVisitorDetail,
  handleVisitors,
} from "./journeys";
import {
  handleFilterOptions,
  handleOverview,
  handleOverviewClientTab,
  handleOverviewGeoPoints,
  handleOverviewGeoTab,
  handleOverviewPageTab,
  handleOverviewSourceTab,
  handleTrend,
} from "./overview";
import {
  handleDimension,
  handlePages,
  handlePagesDashboard,
  handleReferrers,
} from "./pages";
import { handlePerformance } from "./performance";
import {
  handleBrowserCrossBreakdown,
  handleBrowserEngineTrend,
  handleBrowserRadar,
  handleBrowserTrend,
  handleBrowserVersionBreakdown,
  handleClientCrossBreakdown,
  handleClientDimensionTrend,
  handleReferrerDimensionTrend,
  handleReferrerRadar,
  handleUtmDimensionTrend,
} from "./technology";

export async function routeQuery(
  env: Env,
  siteId: string,
  pathname: string,
  url: URL,
  options: { publicMode: boolean },
  request?: Request,
): Promise<Response> {
  if (pathname === "overview") return handleOverview(env, siteId, url);
  if (pathname === "trend") return handleTrend(env, siteId, url);
  if (pathname === "pages") {
    return handlePages(env, siteId, url, !options.publicMode);
  }
  if (pathname === "referrers") {
    return handleReferrers(
      env,
      siteId,
      url,
      options.publicMode ? 8 : 20,
      !options.publicMode,
    );
  }
  if (options.publicMode) return notFound();
  if (pathname === "funnels") {
    return handleFunnel(env, siteId, url, request as Request);
  }
  if (pathname === "pages-dashboard") {
    return handlePagesDashboard(env, siteId, url);
  }
  if (pathname === "page-hash") {
    return handleDimension(env, siteId, url, "hash_fragment");
  }
  if (pathname === "page-query") {
    return handleDimension(env, siteId, url, "query_string");
  }
  if (pathname === "event-types") {
    return handleEventTypes(env, siteId, url);
  }
  if (pathname === "events-summary") {
    return handleEventsSummary(env, siteId, url);
  }
  if (pathname === "events-trend") {
    return handleEventsTrend(env, siteId, url);
  }
  if (pathname === "events-records") {
    return handleEventsRecords(env, siteId, url);
  }
  if (pathname === "event-type-field-values") {
    return handleEventTypeFieldValues(env, siteId, url);
  }
  if (pathname === "event-type-detail") {
    return handleEventTypeDetail(env, siteId, url);
  }
  if (pathname === "event-record-detail") {
    return handleEventRecordDetail(env, siteId, url);
  }
  if (pathname === "sessions") {
    return handleSessions(env, siteId, url);
  }
  if (pathname === "session-detail") {
    return handleSessionDetail(env, siteId, url);
  }
  if (pathname === "visitor-detail") {
    return handleVisitorDetail(env, siteId, url);
  }
  if (pathname === "visitors") {
    return handleVisitors(env, siteId, url);
  }
  if (pathname === "retention") {
    return handleRetention(env, siteId, url);
  }
  if (pathname === "performance") {
    return handlePerformance(env, siteId, url);
  }
  if (pathname === "browser-trend") return handleBrowserTrend(env, siteId, url);
  if (pathname === "browser-engine-trend") {
    return handleBrowserEngineTrend(env, siteId, url);
  }
  if (pathname === "browser-version-breakdown") {
    return handleBrowserVersionBreakdown(env, siteId, url);
  }
  if (pathname === "browser-cross-breakdown") {
    return handleBrowserCrossBreakdown(env, siteId, url);
  }
  if (pathname === "browser-radar") {
    return handleBrowserRadar(env, siteId, url);
  }
  if (pathname === "referrer-radar") {
    return handleReferrerRadar(env, siteId, url);
  }
  if (pathname === "referrer-dimension-trend") {
    return handleReferrerDimensionTrend(env, siteId, url);
  }
  if (pathname === "client-dimension-trend") {
    return handleClientDimensionTrend(env, siteId, url);
  }
  if (pathname === "utm-dimension-trend") {
    return handleUtmDimensionTrend(env, siteId, url);
  }
  if (pathname === "client-cross-breakdown") {
    return handleClientCrossBreakdown(env, siteId, url);
  }
  if (pathname === "utm-source") {
    return handleDimension(
      env,
      siteId,
      url,
      utmDimensionDefinition("source").labelExpr,
    );
  }
  if (pathname === "utm-medium") {
    return handleDimension(
      env,
      siteId,
      url,
      utmDimensionDefinition("medium").labelExpr,
    );
  }
  if (pathname === "utm-campaign") {
    return handleDimension(
      env,
      siteId,
      url,
      utmDimensionDefinition("campaign").labelExpr,
    );
  }
  if (pathname === "utm-term") {
    return handleDimension(
      env,
      siteId,
      url,
      utmDimensionDefinition("term").labelExpr,
    );
  }
  if (pathname === "utm-content") {
    return handleDimension(
      env,
      siteId,
      url,
      utmDimensionDefinition("content").labelExpr,
    );
  }
  if (pathname === "countries") {
    return handleDimension(env, siteId, url, "country", { ignoreGeo: true });
  }
  if (pathname === "filter-options")
    return handleFilterOptions(env, siteId, url);
  if (pathname === "overview-page-path") {
    return handleOverviewPageTab(env, siteId, url, "path");
  }
  if (pathname === "overview-page-title") {
    return handleOverviewPageTab(env, siteId, url, "title");
  }
  if (pathname === "overview-page-hostname") {
    return handleOverviewPageTab(env, siteId, url, "hostname");
  }
  if (pathname === "overview-page-entry") {
    return handleOverviewPageTab(env, siteId, url, "entry");
  }
  if (pathname === "overview-page-exit") {
    return handleOverviewPageTab(env, siteId, url, "exit");
  }
  if (pathname === "overview-source-domain") {
    return handleOverviewSourceTab(env, siteId, url, "domain");
  }
  if (pathname === "overview-source-link") {
    return handleOverviewSourceTab(env, siteId, url, "link");
  }
  if (pathname === "overview-client-browser") {
    return handleOverviewClientTab(env, siteId, url, "browser");
  }
  if (pathname === "overview-client-os-version") {
    return handleOverviewClientTab(env, siteId, url, "osVersion");
  }
  if (pathname === "overview-client-device-type") {
    return handleOverviewClientTab(env, siteId, url, "deviceType");
  }
  if (pathname === "overview-client-language") {
    return handleOverviewClientTab(env, siteId, url, "language");
  }
  if (pathname === "overview-client-screen-size") {
    return handleOverviewClientTab(env, siteId, url, "screenSize");
  }
  if (pathname === "overview-geo-country") {
    return handleOverviewGeoTab(env, siteId, url, "country");
  }
  if (pathname === "overview-geo-region") {
    return handleOverviewGeoTab(env, siteId, url, "region");
  }
  if (pathname === "overview-geo-city") {
    return handleOverviewGeoTab(env, siteId, url, "city");
  }
  if (pathname === "overview-geo-continent") {
    return handleOverviewGeoTab(env, siteId, url, "continent");
  }
  if (pathname === "overview-geo-timezone") {
    return handleOverviewGeoTab(env, siteId, url, "timezone");
  }
  if (pathname === "overview-geo-organization") {
    return handleOverviewGeoTab(env, siteId, url, "organization");
  }
  if (pathname === "overview-geo-points") {
    return handleOverviewGeoPoints(env, siteId, url);
  }
  return notFound();
}
