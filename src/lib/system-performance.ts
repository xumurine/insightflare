export type SystemPerformanceWindowMinutes = 15 | 60 | 360 | 1440;

export interface SystemPerformanceSummary {
  totalEvents: number;
  visits: number;
  customEvents: number;
  activeSites: number;
  eventsPerMinute: number;
  latestCreatedAt: number | null;
  dataFreshnessMs: number | null;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p75LatencyMs: number | null;
  p95LatencyMs: number | null;
  trustedLatencySamples: number;
  delayedEvents: number;
  futureSkewedEvents: number;
  anomalyRate: number;
}

export interface SystemPerformanceOpenVisits {
  total: number;
  stale: number;
  timedOut: number;
  oldestStartedAt: number | null;
  newestActivityAt: number | null;
}

export interface SystemPerformanceTrendPoint {
  bucket: number;
  timestampMs: number;
  visits: number;
  customEvents: number;
  totalEvents: number;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p75LatencyMs: number | null;
  p95LatencyMs: number | null;
  delayedEvents: number;
  futureSkewedEvents: number;
}

export interface SystemPerformanceTopSite {
  siteId: string;
  siteName: string;
  siteDomain: string;
  totalEvents: number;
  visits: number;
  customEvents: number;
  avgLatencyMs: number | null;
  delayedEvents: number;
  futureSkewedEvents: number;
}

export interface SystemPerformanceSlowEvent {
  kind: "visit" | "custom_event";
  siteId: string;
  siteName: string;
  siteDomain: string;
  eventAt: number;
  serverAt: number;
  latencyMs: number;
}

export interface SystemPerformanceData {
  ok: true;
  generatedAt: number;
  window: {
    from: number;
    to: number;
    minutes: SystemPerformanceWindowMinutes;
    bucketSizeMs: number;
  };
  thresholds: {
    delayedMs: number;
    futureSkewMs: number;
    trustedLatencyMaxMs: number;
    staleOpenVisitMs: number;
    timedOutOpenVisitMs: number;
  };
  summary: SystemPerformanceSummary;
  openVisits: SystemPerformanceOpenVisits;
  trend: SystemPerformanceTrendPoint[];
  topSites: SystemPerformanceTopSite[];
  slowEvents: SystemPerformanceSlowEvent[];
}
