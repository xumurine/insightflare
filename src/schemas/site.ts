import { z } from "zod";

import { createEnvelopeSchema, registerSchema } from "./common";

// ─── Output ─────────────────────────────────────────────────────────────

export const SiteSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  name: z.string(),
  domain: z.string(),
  publicEnabled: z.boolean(),
  publicSlug: z.string(),
  createdAt: z.number().int().describe("Unix timestamp in seconds"),
  updatedAt: z.number().int().describe("Unix timestamp in seconds"),
});

// ─── Input ──────────────────────────────────────────────────────────────

export const SiteCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  domain: z.string().trim().min(1).max(255),
  publicEnabled: z.boolean().default(false),
  publicSlug: z.string().trim().max(120).optional(),
});

export const SiteUpdateInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  domain: z.string().trim().min(1).max(255).optional(),
  publicEnabled: z.boolean().optional(),
  publicSlug: z.string().trim().max(120).optional(),
});

// ─── Responses ──────────────────────────────────────────────────────────

export const SiteResponseSchema = createEnvelopeSchema(SiteSchema);
export const SiteListResponseSchema = createEnvelopeSchema(z.array(SiteSchema));
export const SiteDeleteResponseSchema = createEnvelopeSchema(
  z.object({
    siteId: z.string(),
    teamId: z.string(),
    removed: z.literal(true),
  }),
);

// ─── Register ───────────────────────────────────────────────────────────

registerSchema("Site", SiteSchema);
registerSchema("SiteCreateInput", SiteCreateInputSchema);
registerSchema("SiteUpdateInput", SiteUpdateInputSchema);
registerSchema("SiteResponse", SiteResponseSchema);
registerSchema("SiteListResponse", SiteListResponseSchema);
registerSchema("SiteDeleteResponse", SiteDeleteResponseSchema);

// ─── Types ──────────────────────────────────────────────────────────────

export type Site = z.infer<typeof SiteSchema>;
export type SiteCreateInput = z.infer<typeof SiteCreateInputSchema>;
export type SiteUpdateInput = z.infer<typeof SiteUpdateInputSchema>;
