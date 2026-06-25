import { z } from "zod";

import { createEnvelopeSchema, registerSchema } from "./common";

// ─── Output ─────────────────────────────────────────────────────────────

const TeamDashboardSiteOverviewSchema = z.object({
  views: z.number().int(),
  sessions: z.number().int(),
  visitors: z.number().int(),
  bounces: z.number().int(),
  totalDurationMs: z.number().int(),
  avgDurationMs: z.number(),
  bounceRate: z.number(),
  approximateVisitors: z.boolean(),
});

export const TeamDashboardSiteSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  name: z.string(),
  domain: z.string(),
  publicEnabled: z.boolean(),
  publicSlug: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  overview: TeamDashboardSiteOverviewSchema,
  changeRates: z.object({
    views: z.number(),
    visitors: z.number(),
    sessions: z.number(),
    bounceRate: z.number(),
    avgDurationMs: z.number(),
    pagesPerSession: z.number(),
  }),
});

export const TeamDashboardTrendPointSchema = z.object({
  bucket: z.number().int(),
  timestampMs: z.number().int(),
  sites: z.array(
    z.object({
      siteId: z.string(),
      views: z.number().int(),
      visitors: z.number().int(),
    }),
  ),
});

export const TeamDashboardDataSchema = z.object({
  sites: z.array(TeamDashboardSiteSchema),
  trend: z.array(TeamDashboardTrendPointSchema),
});

// ─── Responses ──────────────────────────────────────────────────────────

export const TeamDashboardResponseSchema = createEnvelopeSchema(
  TeamDashboardDataSchema,
);

// ─── Register ───────────────────────────────────────────────────────────

registerSchema("TeamDashboardSite", TeamDashboardSiteSchema);
registerSchema("TeamDashboardTrendPoint", TeamDashboardTrendPointSchema);
registerSchema("TeamDashboardData", TeamDashboardDataSchema);
registerSchema("TeamDashboardResponse", TeamDashboardResponseSchema);

// ─── Types ──────────────────────────────────────────────────────────────

export type TeamDashboardData = z.infer<typeof TeamDashboardDataSchema>;
export type TeamDashboardSite = z.infer<typeof TeamDashboardSiteSchema>;
