import { describe, expect, it } from "vitest";

import {
  ScriptSnippetResponseSchema,
  SiteConfigResponseSchema,
  SiteConfigSchema,
  SiteConfigUpdateInputSchema,
} from "@/schemas/site-config";

describe("SiteConfigSchema", () => {
  const validConfig = {
    trackingStrength: "smart" as const,
    trackQueryParams: true,
    trackHash: true,
    autoTrackOutboundLinks: false,
    domainWhitelist: [],
    pathBlacklist: [],
    ignoreDoNotTrack: true,
    performanceSampleRate: 100,
  };

  it("accepts a valid config", () => {
    expect(SiteConfigSchema.safeParse(validConfig).success).toBe(true);
  });

  it("applies defaults for missing fields", () => {
    const result = SiteConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.trackingStrength).toBe("smart");
      expect(result.data.trackQueryParams).toBe(true);
      expect(result.data.performanceSampleRate).toBe(100);
    }
  });

  it("rejects invalid trackingStrength", () => {
    expect(
      SiteConfigSchema.safeParse({ ...validConfig, trackingStrength: "medium" })
        .success,
    ).toBe(false);
  });

  it("rejects performanceSampleRate above 100", () => {
    expect(
      SiteConfigSchema.safeParse({ ...validConfig, performanceSampleRate: 101 })
        .success,
    ).toBe(false);
  });

  it("rejects performanceSampleRate below 0", () => {
    expect(
      SiteConfigSchema.safeParse({ ...validConfig, performanceSampleRate: -1 })
        .success,
    ).toBe(false);
  });
});

describe("SiteConfigUpdateInputSchema", () => {
  it("accepts partial update", () => {
    const result = SiteConfigUpdateInputSchema.safeParse({
      trackQueryParams: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    expect(SiteConfigUpdateInputSchema.safeParse({}).success).toBe(true);
  });

  it("rejects invalid enum value", () => {
    expect(
      SiteConfigUpdateInputSchema.safeParse({ trackingStrength: "invalid" })
        .success,
    ).toBe(false);
  });
});

describe("SiteConfigResponseSchema", () => {
  it("accepts valid envelope", () => {
    const result = SiteConfigResponseSchema.safeParse({
      ok: true,
      requestId: "r",
      timestamp: "t",
      data: {},
    });
    expect(result.success).toBe(true);
  });
});

describe("ScriptSnippetResponseSchema", () => {
  it("accepts valid snippet response", () => {
    const result = ScriptSnippetResponseSchema.safeParse({
      ok: true,
      requestId: "r",
      timestamp: "t",
      data: {
        siteId: "s1",
        src: "https://cdn.example.com/script.js",
        snippet: '<script src="https://cdn.example.com/script.js"></script>',
      },
    });
    expect(result.success).toBe(true);
  });
});
