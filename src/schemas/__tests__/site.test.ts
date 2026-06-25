import { describe, expect, it } from "vitest";

import {
  SiteCreateInputSchema,
  SiteDeleteResponseSchema,
  SiteListResponseSchema,
  SiteResponseSchema,
  SiteSchema,
  SiteUpdateInputSchema,
} from "@/schemas/site";

describe("SiteSchema", () => {
  const validSite = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    teamId: "550e8400-e29b-41d4-a716-446655440001",
    name: "My Site",
    domain: "example.com",
    publicEnabled: false,
    publicSlug: "my-site",
    createdAt: 1700000000,
    updatedAt: 1700000000,
  };

  it("accepts a valid site", () => {
    expect(SiteSchema.safeParse(validSite).success).toBe(true);
  });

  it("rejects invalid uuid", () => {
    expect(
      SiteSchema.safeParse({ ...validSite, id: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("rejects non-integer timestamps", () => {
    expect(SiteSchema.safeParse({ ...validSite, createdAt: 1.5 }).success).toBe(
      false,
    );
  });
});

describe("SiteCreateInputSchema", () => {
  it("accepts valid input", () => {
    const result = SiteCreateInputSchema.safeParse({
      name: "New Site",
      domain: "example.com",
    });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from name", () => {
    const result = SiteCreateInputSchema.safeParse({
      name: "  New Site  ",
      domain: "example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("New Site");
  });

  it("rejects empty name", () => {
    expect(
      SiteCreateInputSchema.safeParse({ name: "", domain: "example.com" })
        .success,
    ).toBe(false);
  });

  it("rejects name exceeding 120 chars", () => {
    expect(
      SiteCreateInputSchema.safeParse({
        name: "a".repeat(121),
        domain: "example.com",
      }).success,
    ).toBe(false);
  });

  it("rejects domain exceeding 255 chars", () => {
    expect(
      SiteCreateInputSchema.safeParse({
        name: "Site",
        domain: "a".repeat(256),
      }).success,
    ).toBe(false);
  });

  it("defaults publicEnabled to false", () => {
    const result = SiteCreateInputSchema.safeParse({
      name: "Site",
      domain: "example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.publicEnabled).toBe(false);
  });
});

describe("SiteUpdateInputSchema", () => {
  it("accepts partial update", () => {
    const result = SiteUpdateInputSchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    expect(SiteUpdateInputSchema.safeParse({}).success).toBe(true);
  });
});

describe("SiteResponseSchema", () => {
  it("accepts valid envelope response", () => {
    const result = SiteResponseSchema.safeParse({
      ok: true,
      requestId: "ray-1",
      timestamp: "2025-01-01T00:00:00.000Z",
      data: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        teamId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Site",
        domain: "example.com",
        publicEnabled: false,
        publicSlug: "s",
        createdAt: 1700000000,
        updatedAt: 1700000000,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("SiteListResponseSchema", () => {
  it("accepts array of sites", () => {
    const result = SiteListResponseSchema.safeParse({
      ok: true,
      requestId: "ray-1",
      timestamp: "2025-01-01T00:00:00.000Z",
      data: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("SiteDeleteResponseSchema", () => {
  it("accepts valid delete response", () => {
    const result = SiteDeleteResponseSchema.safeParse({
      ok: true,
      requestId: "ray-1",
      timestamp: "2025-01-01T00:00:00.000Z",
      data: { siteId: "s1", teamId: "t1", removed: true },
    });
    expect(result.success).toBe(true);
  });

  it("rejects removed=false", () => {
    const result = SiteDeleteResponseSchema.safeParse({
      ok: true,
      requestId: "ray-1",
      timestamp: "2025-01-01T00:00:00.000Z",
      data: { siteId: "s1", teamId: "t1", removed: false },
    });
    expect(result.success).toBe(false);
  });
});
