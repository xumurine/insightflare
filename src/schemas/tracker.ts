import { z } from "zod";

import { registerSchema } from "./common";

// ─── Input ──────────────────────────────────────────────────────────────

const UaClientHintsSchema = z.object({
  brands: z
    .array(z.object({ brand: z.string(), version: z.string() }))
    .optional(),
  fullVersionList: z
    .array(z.object({ brand: z.string(), version: z.string() }))
    .optional(),
  mobile: z.boolean().optional(),
  platform: z.string().optional(),
  platformVersion: z.string().optional(),
  model: z.string().optional(),
  formFactors: z.array(z.string()).optional(),
});

const PerformancePayloadSchema = z.object({
  ttfb: z.number().optional(),
  fcp: z.number().optional(),
  lcp: z.number().optional(),
  cls: z.number().optional(),
  inp: z.number().optional(),
});

export const TrackerClientPayloadSchema = z.object({
  siteId: z.string(),
  kind: z.enum(["pageview", "leave", "visibility", "custom_event", "identify"]),
  visitId: z.string().max(128),
  previousVisitId: z.string().optional(),
  performanceVisitId: z.string().optional(),
  eventId: z.string().optional(),
  sequence: z.number().int().optional(),
  timestamp: z.number().int().describe("Unix milliseconds").optional(),
  startedAt: z.number().int().describe("Unix milliseconds").optional(),
  pathname: z.string().optional(),
  query: z.string().optional(),
  hash: z.string().optional(),
  hostname: z.string().optional(),
  title: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  screenWidth: z.number().int().optional(),
  screenHeight: z.number().int().optional(),
  referrerUrl: z.string().optional(),
  visitorId: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
  durationMs: z.number().int().optional(),
  exitReason: z.string().optional(),
  visibilityState: z.enum(["hidden", "visible"]).optional(),
  eventName: z.string().max(120).optional(),
  eventData: z
    .unknown()
    .describe("Custom event payload (arbitrary JSON)")
    .optional(),
  performance: PerformancePayloadSchema.optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  uaClientHints: UaClientHintsSchema.optional(),
});

// ─── Register ───────────────────────────────────────────────────────────

registerSchema("TrackerClientPayload", TrackerClientPayloadSchema);

// ─── Types ──────────────────────────────────────────────────────────────

export type TrackerClientPayload = z.infer<typeof TrackerClientPayloadSchema>;
