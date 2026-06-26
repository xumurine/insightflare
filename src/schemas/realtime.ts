import { z } from "zod";

import { createEnvelopeSchema, registerSchema } from "./common";

// ─── Output ─────────────────────────────────────────────────────────────

export const RealtimeEventSchema = z
  .object({
    id: z.string(),
    eventType: z.enum(["pageview", "custom_event", "leave"]),
    eventAt: z.number().int().describe("Event timestamp (Unix ms)"),
    visitId: z.string(),
    sessionId: z.string().optional(),
    visitorId: z.string(),
    pathname: z.string().optional(),
    hash: z.string().optional(),
    title: z.string().optional(),
    hostname: z.string().optional(),
    referrerUrl: z.string().optional(),
    referrerHost: z.string().optional(),
    country: z.string().optional(),
    region: z.string().optional(),
    regionCode: z.string().optional(),
    city: z.string().optional(),
    continent: z.string().optional(),
    timezone: z.string().optional(),
    organization: z.string().optional(),
    browser: z.string().optional(),
    os: z.string().optional(),
    osVersion: z.string().optional(),
    deviceType: z.string().optional(),
    language: z.string().optional(),
    screenSize: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    eventName: z
      .string()
      .optional()
      .describe("Present only for custom_event type"),
  })
  .describe("Individual real-time event from a visitor");

export const RealtimeSnapshotDataSchema = z
  .object({
    activeNow: z
      .number()
      .int()
      .describe("Number of distinct visitors active in the last 5 minutes"),
    events: z.array(RealtimeEventSchema),
  })
  .describe("Real-time activity snapshot for a site");

export const ActiveVisitorsSchema = z.object({
  activeNow: z
    .number()
    .int()
    .describe("Number of distinct visitors active in the last 5 minutes"),
});

// ─── Responses ──────────────────────────────────────────────────────────

export const RealtimeSnapshotResponseSchema = createEnvelopeSchema(
  RealtimeSnapshotDataSchema,
);
export const ActiveVisitorsResponseSchema =
  createEnvelopeSchema(ActiveVisitorsSchema);

// ─── Register ───────────────────────────────────────────────────────────

registerSchema("RealtimeEvent", RealtimeEventSchema);
registerSchema("RealtimeSnapshotData", RealtimeSnapshotDataSchema);
registerSchema("ActiveVisitors", ActiveVisitorsSchema);
registerSchema("RealtimeSnapshotResponse", RealtimeSnapshotResponseSchema);
registerSchema("ActiveVisitorsResponse", ActiveVisitorsResponseSchema);

// ─── Types ──────────────────────────────────────────────────────────────

export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;
export type RealtimeSnapshotData = z.infer<typeof RealtimeSnapshotDataSchema>;
