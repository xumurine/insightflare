import { z } from "zod";

import { registerSchema } from "./common";

// ─── Input ──────────────────────────────────────────────────────────────

const UaClientHintsSchema = z
  .object({
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
  })
  .strict();

const PerformancePayloadSchema = z
  .object({
    ttfb: z.number().optional(),
    fcp: z.number().optional(),
    lcp: z.number().optional(),
    cls: z.number().optional(),
    inp: z.number().optional(),
  })
  .strict();

export const TrackerClientPayloadSchema = z
  .object({
    siteId: z.string().max(64),
    kind: z.enum([
      "pageview",
      "leave",
      "visibility",
      "custom_event",
      "identify",
    ]),
    visitId: z.string().max(128),
    previousVisitId: z.string().max(128).optional(),
    performanceVisitId: z.string().max(128).optional(),
    eventId: z.string().max(64).optional(),
    sequence: z.number().int().optional(),
    timestamp: z.number().int().describe("Unix milliseconds").optional(),
    startedAt: z.number().int().describe("Unix milliseconds").optional(),
    pathname: z.string().max(2048).optional(),
    query: z.string().max(2048).optional(),
    hash: z.string().max(512).optional(),
    hostname: z.string().max(255).optional(),
    title: z.string().max(512).optional(),
    language: z.string().max(32).optional(),
    timezone: z.string().max(64).optional(),
    screenWidth: z.number().int().optional(),
    screenHeight: z.number().int().optional(),
    referrerUrl: z.string().max(4096).optional(),
    visitorId: z.string().max(64).optional(),
    userId: z.string().max(128).optional(),
    userName: z.string().max(128).optional(),
    durationMs: z.number().int().optional(),
    exitReason: z.string().max(64).optional(),
    visibilityState: z.enum(["hidden", "visible"]).optional(),
    eventName: z.string().max(120).optional(),
    eventData: z
      .unknown()
      .describe("Custom event payload (arbitrary JSON)")
      .optional(),
    performance: PerformancePayloadSchema.optional(),
    utmSource: z.string().max(255).optional(),
    utmMedium: z.string().max(255).optional(),
    utmCampaign: z.string().max(255).optional(),
    utmTerm: z.string().max(255).optional(),
    utmContent: z.string().max(255).optional(),
    uaClientHints: UaClientHintsSchema.optional(),
    collectToken: z.string().max(4096).optional(),
  })
  .strict()
  .describe("Payload sent by the InsightFlare client SDK for event tracking");

// ─── Register ───────────────────────────────────────────────────────────

registerSchema("TrackerClientPayload", TrackerClientPayloadSchema);

// ─── Types ──────────────────────────────────────────────────────────────

export type TrackerClientPayload = z.infer<typeof TrackerClientPayloadSchema>;
