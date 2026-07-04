import { DEMO_SITE_PROFILES } from "@/lib/realtime/demo-site-profiles";
import {
  createDemoRng,
  sInt,
  sPick,
  weightedPickLabel,
  windowBucket,
} from "@/lib/realtime/demo-utils";
import { pickDemoGeoContext } from "@/lib/realtime/mock/dimension-pickers";

type WindowMinutes = 60 | 1440 | 10080 | 43200;

interface DemoBotEvent {
  timestamp: string;
  receivedAt: number;
  siteId: string;
  siteName: string;
  siteDomain: string;
  kind: string;
  confidence: string;
  reasons: string[];
  ip: string;
  userAgent: string;
  origin: string;
  hostname: string;
  pathname: string;
  country: string;
  region: string;
  city: string;
  continent: string;
  colo: string;
  asn: number;
  asOrganization: string;
  verifiedBotCategory: string;
  rayId: string;
  traceId: string;
  latitude: number | null;
  longitude: number | null;
  botScore: number | null;
  userAgentLength: number;
}

interface DemoBotProtectionData {
  ok: true;
  configured: boolean;
  generatedAt: number;
  window: {
    minutes: number;
    from: number;
    to: number;
  };
  summary: {
    total: number;
    baselineRequests: number;
    botRequestRatio: number;
    highConfidence: number;
    mediumConfidence: number;
    affectedSites: number;
    uniqueAsns: number;
    uniqueCountries: number;
  };
  mapPoints: Array<{
    latitude: number;
    longitude: number;
    country: string;
    pointCount: number;
  }>;
  trend: Array<{
    timestampMs: number;
    count: number;
    baselineCount: number;
    botRatio: number;
  }>;
  reasons: Array<{ reason: string; count: number }>;
  asns: Array<{ asn: number; asOrganization: string; count: number }>;
  events: DemoBotEvent[];
}

const BOT_REASON_WEIGHTS = [
  { label: "ua_isbot", weight: 34 },
  { label: "hosting_asn", weight: 28 },
  { label: "script_ua", weight: 18 },
  { label: "cf_bot_score_low", weight: 16 },
  { label: "missing_browser_provenance", weight: 12 },
  { label: "network_service_asn", weight: 10 },
  { label: "origin_hostname_mismatch", weight: 7 },
  { label: "ua_too_long", weight: 5 },
] as const;

const BOT_ASNS = [
  { asn: 15169, organization: "Google LLC", weight: 16 },
  { asn: 16509, organization: "Amazon.com, Inc.", weight: 22 },
  { asn: 8075, organization: "Microsoft Corporation", weight: 17 },
  { asn: 13335, organization: "Cloudflare, Inc.", weight: 18 },
  { asn: 14618, organization: "Amazon.com, Inc.", weight: 14 },
  { asn: 14061, organization: "DigitalOcean, LLC", weight: 13 },
  { asn: 24940, organization: "Hetzner Online GmbH", weight: 12 },
  { asn: 63949, organization: "Akamai Connected Cloud", weight: 9 },
  { asn: 16276, organization: "OVH SAS", weight: 8 },
] as const;

const BOT_USER_AGENTS = [
  "Googlebot/2.1 (+http://www.google.com/bot.html)",
  "bingbot/2.0 (+http://www.bing.com/bingbot.htm)",
  "AhrefsBot/7.0 (+http://ahrefs.com/robot/)",
  "SemrushBot/7~bl (+http://www.semrush.com/bot.html)",
  "python-requests/2.32.3",
  "curl/8.7.1",
  "Go-http-client/2.0",
  "Mozilla/5.0 zgrab/0.x",
] as const;

const COLOS = [
  "SJC",
  "LAX",
  "DFW",
  "IAD",
  "FRA",
  "AMS",
  "SIN",
  "NRT",
  "HKG",
] as const;

function bucketSizeMs(minutes: number): number {
  if (minutes <= 1440) return 60 * 60 * 1000;
  if (minutes <= 10080) return 6 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function weightedPickAsn(rng: () => number) {
  const total = BOT_ASNS.reduce((sum, item) => sum + item.weight, 0);
  let hit = rng() * total;
  for (const item of BOT_ASNS) {
    hit -= item.weight;
    if (hit <= 0) return item;
  }
  return BOT_ASNS[0];
}

function pickReasons(rng: () => number): string[] {
  const first = weightedPickLabel(rng, [...BOT_REASON_WEIGHTS], "ua_isbot");
  const reasons = new Set([first]);
  if (rng() < 0.42) {
    reasons.add(weightedPickLabel(rng, [...BOT_REASON_WEIGHTS], "hosting_asn"));
  }
  if (rng() < 0.14) {
    reasons.add(
      weightedPickLabel(
        rng,
        [...BOT_REASON_WEIGHTS],
        "missing_browser_provenance",
      ),
    );
  }
  return [...reasons];
}

function randomIpv4(rng: () => number): string {
  return [
    sInt(rng, 13, 223),
    sInt(rng, 0, 255),
    sInt(rng, 0, 255),
    sInt(rng, 1, 254),
  ].join(".");
}

function aggregateEvents(events: DemoBotEvent[], minutes: number) {
  const generatedAt = Date.now();
  const from = generatedAt - minutes * 60 * 1000;
  const bucketMs = bucketSizeMs(minutes);
  const trend = new Map<
    number,
    { count: number; baselineCount: number; botRatio: number }
  >();
  const reasons = new Map<string, number>();
  const asns = new Map<
    number,
    { asn: number; asOrganization: string; count: number }
  >();
  const mapPoints = new Map<
    string,
    {
      latitude: number;
      longitude: number;
      country: string;
      pointCount: number;
    }
  >();

  for (let bucket = from; bucket <= generatedAt; bucket += bucketMs) {
    trend.set(Math.floor(bucket / bucketMs) * bucketMs, {
      count: 0,
      baselineCount: 0,
      botRatio: 0,
    });
  }

  for (const event of events) {
    const bucket = Math.floor(event.receivedAt / bucketMs) * bucketMs;
    const point = trend.get(bucket) ?? {
      count: 0,
      baselineCount: 0,
      botRatio: 0,
    };
    point.count += 1;
    trend.set(bucket, point);

    for (const reason of event.reasons) {
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
    }

    const asn = asns.get(event.asn);
    if (asn) {
      asn.count += 1;
    } else {
      asns.set(event.asn, {
        asn: event.asn,
        asOrganization: event.asOrganization,
        count: 1,
      });
    }

    if (event.latitude !== null && event.longitude !== null) {
      const lat = Math.round(event.latitude * 100) / 100;
      const lon = Math.round(event.longitude * 100) / 100;
      const key = `${event.country}:${lat}:${lon}`;
      const current = mapPoints.get(key);
      if (current) {
        current.pointCount += 1;
      } else {
        mapPoints.set(key, {
          latitude: lat,
          longitude: lon,
          country: event.country,
          pointCount: 1,
        });
      }
    }
  }

  const sortCounts = <T extends { count: number }>(items: T[]) =>
    items.sort((left, right) => right.count - left.count).slice(0, 10);

  return {
    trend: [...trend.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([timestampMs, point]) => ({ timestampMs, ...point })),
    reasons: sortCounts(
      [...reasons.entries()].map(([reason, count]) => ({ reason, count })),
    ),
    asns: sortCounts([...asns.values()]),
    mapPoints: [...mapPoints.values()],
  };
}

export function generateDemoBotProtectionData(
  minutes: WindowMinutes,
): DemoBotProtectionData {
  const generatedAt = Date.now();
  const from = generatedAt - minutes * 60 * 1000;
  const rng = createDemoRng(
    "global",
    `bot-protection:${minutes}:${windowBucket(from, generatedAt)}`,
  );
  const eventTargetByWindow: Record<WindowMinutes, number> = {
    60: 160,
    1440: 520,
    10080: 960,
    43200: 1500,
  };
  const target = eventTargetByWindow[minutes];
  const events: DemoBotEvent[] = [];

  for (let index = 0; index < target; index += 1) {
    const site = sPick(rng, DEMO_SITE_PROFILES);
    const country = weightedPickLabel(
      rng,
      site.topCountries.map((item) => ({
        label: item.code,
        weight: item.weight,
      })),
      "US",
    );
    const geo = pickDemoGeoContext(rng, country);
    const asn = weightedPickAsn(rng);
    const reasons = pickReasons(rng);
    const receivedAt =
      generatedAt - Math.floor(Math.pow(rng(), 1.35) * minutes * 60 * 1000);
    const pathname = sPick(rng, site.paths) || "/";
    const userAgent = sPick(rng, BOT_USER_AGENTS);
    const confidence =
      reasons.includes("ua_isbot") ||
      reasons.includes("script_ua") ||
      reasons.includes("cf_bot_score_low")
        ? "high"
        : "medium";

    events.push({
      timestamp: new Date(receivedAt).toISOString(),
      receivedAt,
      siteId: site.id,
      siteName: site.name,
      siteDomain: site.domain,
      kind: "collect",
      confidence,
      reasons,
      ip: randomIpv4(rng),
      userAgent,
      origin: `https://${site.domain}`,
      hostname: site.domain,
      pathname,
      country,
      region: geo.regionName || geo.region,
      city: geo.cityName || geo.city,
      continent: geo.continent,
      colo: sPick(rng, COLOS),
      asn: asn.asn,
      asOrganization: asn.organization,
      verifiedBotCategory: userAgent.toLowerCase().includes("bot")
        ? sPick(rng, ["Search Engine Crawler", "Monitoring", "SEO"])
        : "",
      rayId: `${sInt(rng, 100000, 999999).toString(16)}${index.toString(16)}demo`,
      traceId: `demo-bot-${index.toString(36).padStart(4, "0")}`,
      latitude: geo.latitude,
      longitude: geo.longitude,
      botScore: confidence === "high" ? sInt(rng, 1, 28) : sInt(rng, 30, 54),
      userAgentLength: userAgent.length,
    });
  }

  events.sort(
    (left, right) =>
      right.receivedAt - left.receivedAt ||
      left.traceId.localeCompare(right.traceId),
  );

  const aggregates = aggregateEvents(events, minutes);
  const affectedSites = new Set(events.map((event) => event.siteId));
  const uniqueAsns = new Set(events.map((event) => event.asn));
  const uniqueCountries = new Set(events.map((event) => event.country));
  const ratioByWindow: Record<WindowMinutes, number> = {
    60: 0.18,
    1440: 0.09,
    10080: 0.07,
    43200: 0.06,
  };
  const botRequestRatio =
    ratioByWindow[minutes] + Math.round(rng() * 20) / 1000;
  const baselineRequests = Math.max(
    events.length,
    Math.round((events.length / botRequestRatio) * (1 - botRequestRatio)),
  );
  const botTrendTotal = aggregates.trend.reduce(
    (sum, point) => sum + point.count,
    0,
  );
  const trendBaselineScale =
    botTrendTotal > 0 ? baselineRequests / botTrendTotal : 0;
  for (const point of aggregates.trend) {
    point.baselineCount = Math.round(point.count * trendBaselineScale);
    const total = point.count + point.baselineCount;
    point.botRatio = total > 0 ? point.count / total : 0;
  }

  return {
    ok: true,
    configured: true,
    generatedAt,
    window: {
      minutes,
      from,
      to: generatedAt,
    },
    summary: {
      total: events.length,
      baselineRequests,
      botRequestRatio: events.length / (baselineRequests + events.length),
      highConfidence: events.filter((event) => event.confidence === "high")
        .length,
      mediumConfidence: events.filter((event) => event.confidence === "medium")
        .length,
      affectedSites: affectedSites.size,
      uniqueAsns: uniqueAsns.size,
      uniqueCountries: uniqueCountries.size,
    },
    events,
    ...aggregates,
  };
}
