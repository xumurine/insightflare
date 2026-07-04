import { describe, expect, it } from "vitest";

import {
  TeamDashboardDataSchema,
  TeamDashboardResponseSchema,
  TeamDashboardSiteSchema,
  TeamDashboardTrendPointSchema,
} from "@/schemas/team";

describe("TeamDashboardSiteSchema", () => {
  const validSite = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    teamId: "550e8400-e29b-41d4-a716-446655440001",
    name: "Blog",
    domain: "blog.example.com",
    publicEnabled: false,
    publicSlug: "blog",
    createdAt: 1700000000,
    updatedAt: 1700000000,
    overview: {
      views: 1000,
      sessions: 500,
      visitors: 300,
      bounces: 100,
      totalDurationMs: 600000,
      avgDurationMs: 1200,
      bounceRate: 20,
      approximateVisitors: false,
    },
    changeRates: {
      views: 5.2,
      visitors: 3.1,
      sessions: 4.0,
      bounceRate: -1.5,
      avgDurationMs: 2.3,
      pagesPerSession: 0.5,
    },
  };

  it("accepts a valid dashboard site", () => {
    expect(TeamDashboardSiteSchema.safeParse(validSite).success).toBe(true);
  });

  it("rejects invalid uuid in id", () => {
    expect(
      TeamDashboardSiteSchema.safeParse({ ...validSite, id: "bad" }).success,
    ).toBe(false);
  });

  it("rejects non-integer view count", () => {
    expect(
      TeamDashboardSiteSchema.safeParse({
        ...validSite,
        overview: { ...validSite.overview, views: 1.5 },
      }).success,
    ).toBe(false);
  });
});

describe("TeamDashboardTrendPointSchema", () => {
  it("accepts valid trend point", () => {
    expect(
      TeamDashboardTrendPointSchema.safeParse({
        bucket: 1700000000000,
        timestampMs: 1700000000000,
        sites: [{ siteId: "s1", views: 100, visitors: 50 }],
      }).success,
    ).toBe(true);
  });

  it("accepts empty sites array", () => {
    expect(
      TeamDashboardTrendPointSchema.safeParse({
        bucket: 1,
        timestampMs: 1,
        sites: [],
      }).success,
    ).toBe(true);
  });
});

describe("TeamDashboardDataSchema", () => {
  it("accepts valid dashboard data", () => {
    expect(
      TeamDashboardDataSchema.safeParse({ sites: [], trend: [] }).success,
    ).toBe(true);
  });
});

describe("TeamDashboardResponseSchema", () => {
  it("accepts valid envelope", () => {
    expect(
      TeamDashboardResponseSchema.safeParse({
        ok: true,
        requestId: "r",
        timestamp: "t",
        data: { sites: [], trend: [] },
      }).success,
    ).toBe(true);
  });
});
