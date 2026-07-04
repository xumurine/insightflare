import type { Locale } from "@/lib/i18n/config";

export const LANDING_EMBED_VIEWS = [
  "overview",
  "overview-metrics",
  "traffic-trend",
  "traffic-pages",
  "traffic-sources",
  "traffic-clients",
  "traffic-geo",
  "geo-map",
  "realtime",
  "realtime-trend",
  "realtime-stream",
  "realtime-breakdown",
  "retention",
  "pages",
  "events",
  "events-summary",
  "events-trend",
  "events-top",
  "events-context",
  "events-records",
  "browsers",
  "browsers-share",
  "browsers-trends",
  "browsers-versions",
  "browsers-cross",
  "browsers-performance",
  "browsers-compat",
  "devices",
  "devices-share",
  "devices-trends",
  "devices-screens",
  "devices-cross",
  "performance",
  "sessions",
  "visitors",
  "funnels",
] as const;

export type LandingEmbedView = (typeof LANDING_EMBED_VIEWS)[number];

export const LANDING_EMBED_DEMO_SITE = {
  teamSlug: "xeoos-team",
  siteSlug: "dailypulse-news",
  siteId: "demo-site-003",
  siteName: "DailyPulse News",
  siteDomain: "dailypulse.news",
} as const;

const LANDING_EMBED_SECTION_BY_VIEW = {
  overview: "",
  "overview-metrics": "",
  "traffic-trend": "",
  "traffic-pages": "",
  "traffic-sources": "",
  "traffic-clients": "",
  "traffic-geo": "",
  "geo-map": "",
  realtime: "realtime",
  "realtime-trend": "realtime",
  "realtime-stream": "realtime",
  "realtime-breakdown": "realtime",
  retention: "retention",
  pages: "pages",
  events: "events",
  "events-summary": "events",
  "events-trend": "events",
  "events-top": "events",
  "events-context": "events",
  "events-records": "events",
  browsers: "browsers",
  "browsers-share": "browsers",
  "browsers-trends": "browsers",
  "browsers-versions": "browsers",
  "browsers-cross": "browsers",
  "browsers-performance": "browsers",
  "browsers-compat": "browsers",
  devices: "devices",
  "devices-share": "devices",
  "devices-trends": "devices",
  "devices-screens": "devices",
  "devices-cross": "devices",
  performance: "performance",
  sessions: "sessions",
  visitors: "visitors",
  funnels: "funnels",
} satisfies Record<LandingEmbedView, string>;

export const LANDING_EMBED_VIEW_ALIASES: Partial<
  Record<LandingEmbedView, LandingEmbedView>
> = {
  overview: "overview-metrics",
  realtime: "realtime-stream",
  events: "events-summary",
  browsers: "browsers-share",
  devices: "devices-share",
};

export function normalizeLandingEmbedView(
  view: LandingEmbedView,
): LandingEmbedView {
  return LANDING_EMBED_VIEW_ALIASES[view] ?? view;
}

export function isLandingEmbedView(
  value: string | null | undefined,
): value is LandingEmbedView {
  return LANDING_EMBED_VIEWS.includes(value as LandingEmbedView);
}

export function buildLandingEmbedDemoSitePath(
  locale: Locale,
  view: LandingEmbedView,
): string {
  const base = `/${locale}/app/${LANDING_EMBED_DEMO_SITE.teamSlug}/${LANDING_EMBED_DEMO_SITE.siteSlug}`;
  const section = LANDING_EMBED_SECTION_BY_VIEW[view];
  return section ? `${base}/${section}` : base;
}
