import { z } from "zod";

import { createEnvelopeSchema, registerSchema } from "./common";

// ─── Output ─────────────────────────────────────────────────────────────

export const SiteConfigSchema = z
  .object({
    trackingStrength: z
      .enum(["strong", "smart", "weak"])
      .default("smart")
      .describe(
        "Controls EU privacy mode. strong = never use EU mode, weak = always EU mode, smart = auto-detect",
      ),
    trackQueryParams: z
      .boolean()
      .default(true)
      .describe("Include URL query parameters in tracked page paths"),
    trackHash: z
      .boolean()
      .default(true)
      .describe("Include URL hash fragments in tracked page paths"),
    autoTrackOutboundLinks: z
      .boolean()
      .default(false)
      .describe("Automatically track outbound link clicks"),
    domainWhitelist: z
      .array(z.string())
      .default([])
      .describe("Additional allowed hostnames beyond the site's own domain"),
    pathBlacklist: z
      .array(z.string())
      .default([])
      .describe("URL paths to exclude from tracking (prefix match)"),
    ignoreDoNotTrack: z
      .boolean()
      .default(true)
      .describe("Track visitors even if their browser sends DNT header"),
    performanceSampleRate: z
      .number()
      .min(0)
      .max(100)
      .default(100)
      .describe(
        "Percentage of sessions that collect Core Web Vitals (0 = disabled)",
      ),
  })
  .describe("Tracking script configuration for a site");

export const ScriptSnippetSchema = z.object({
  siteId: z.string(),
  src: z.string().describe("Full URL to the tracking script"),
  snippet: z.string().describe("HTML script tag"),
});

// ─── Input ──────────────────────────────────────────────────────────────

export const SiteConfigUpdateInputSchema = z
  .object({
    trackingStrength: z.enum(["strong", "smart", "weak"]).optional(),
    trackQueryParams: z.boolean().optional(),
    trackHash: z.boolean().optional(),
    autoTrackOutboundLinks: z.boolean().optional(),
    domainWhitelist: z.array(z.string()).optional(),
    pathBlacklist: z.array(z.string()).optional(),
    ignoreDoNotTrack: z.boolean().optional(),
    performanceSampleRate: z.number().min(0).max(100).optional(),
  })
  .strict();

// ─── Responses ──────────────────────────────────────────────────────────

export const SiteConfigResponseSchema = createEnvelopeSchema(SiteConfigSchema);
export const ScriptSnippetResponseSchema =
  createEnvelopeSchema(ScriptSnippetSchema);

// ─── Register ───────────────────────────────────────────────────────────

registerSchema("SiteConfig", SiteConfigSchema);
registerSchema("SiteConfigUpdateInput", SiteConfigUpdateInputSchema);
registerSchema("ScriptSnippet", ScriptSnippetSchema);
registerSchema("SiteConfigResponse", SiteConfigResponseSchema);
registerSchema("ScriptSnippetResponse", ScriptSnippetResponseSchema);

// ─── Types ──────────────────────────────────────────────────────────────

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type SiteConfigUpdateInput = z.infer<typeof SiteConfigUpdateInputSchema>;
