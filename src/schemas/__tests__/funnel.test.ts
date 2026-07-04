import { describe, expect, it } from "vitest";

import {
  FunnelAnalysisStepSchema,
  FunnelAnalysisSummarySchema,
  FunnelAnalyzeInputSchema,
  FunnelCreateInputSchema,
  FunnelDefinitionSchema,
  FunnelStepSchema,
} from "@/schemas/funnel";

describe("FunnelStepSchema", () => {
  it("accepts a valid pageview step", () => {
    expect(
      FunnelStepSchema.safeParse({ type: "pageview", value: "/home" }).success,
    ).toBe(true);
  });

  it("accepts a valid event step", () => {
    expect(
      FunnelStepSchema.safeParse({ type: "event", value: "signup" }).success,
    ).toBe(true);
  });

  it("rejects invalid type", () => {
    expect(
      FunnelStepSchema.safeParse({ type: "click", value: "x" }).success,
    ).toBe(false);
  });

  it("rejects empty value", () => {
    expect(
      FunnelStepSchema.safeParse({ type: "pageview", value: "" }).success,
    ).toBe(false);
  });

  it("trims whitespace from value", () => {
    const result = FunnelStepSchema.safeParse({
      type: "pageview",
      value: "  /home  ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.value).toBe("/home");
  });
});

describe("FunnelDefinitionSchema", () => {
  const validDefinition = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    siteId: "s1",
    name: "Signup Funnel",
    steps: [
      { type: "pageview" as const, value: "/landing" },
      { type: "event" as const, value: "signup" },
    ],
    createdAt: 1700000000,
    updatedAt: 1700000000,
  };

  it("accepts a valid definition", () => {
    expect(FunnelDefinitionSchema.safeParse(validDefinition).success).toBe(
      true,
    );
  });

  it("rejects invalid uuid", () => {
    expect(
      FunnelDefinitionSchema.safeParse({ ...validDefinition, id: "bad" })
        .success,
    ).toBe(false);
  });
});

describe("FunnelCreateInputSchema", () => {
  it("accepts valid input with 2 steps", () => {
    const result = FunnelCreateInputSchema.safeParse({
      name: "My Funnel",
      steps: [
        { type: "pageview", value: "/a" },
        { type: "pageview", value: "/b" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects fewer than 2 steps", () => {
    expect(
      FunnelCreateInputSchema.safeParse({
        name: "Funnel",
        steps: [{ type: "pageview", value: "/a" }],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 10 steps", () => {
    const steps = Array.from({ length: 11 }, (_, i) => ({
      type: "pageview" as const,
      value: `/step-${i}`,
    }));
    expect(
      FunnelCreateInputSchema.safeParse({ name: "Funnel", steps }).success,
    ).toBe(false);
  });

  it("rejects empty name", () => {
    expect(
      FunnelCreateInputSchema.safeParse({
        name: "",
        steps: [
          { type: "pageview", value: "/a" },
          { type: "pageview", value: "/b" },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("FunnelAnalyzeInputSchema", () => {
  it("accepts valid input", () => {
    const result = FunnelAnalyzeInputSchema.safeParse({
      steps: [
        { type: "pageview", value: "/a" },
        { type: "event", value: "buy" },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("FunnelAnalysisStepSchema", () => {
  it("accepts valid analysis step", () => {
    expect(
      FunnelAnalysisStepSchema.safeParse({
        index: 0,
        label: "/landing",
        type: "pageview",
        sessions: 100,
        visitors: 80,
        conversionRate: 100,
        stepConversionRate: 100,
        dropOffSessions: 0,
        dropOffRate: 0,
      }).success,
    ).toBe(true);
  });
});

describe("FunnelAnalysisSummarySchema", () => {
  it("accepts valid summary", () => {
    expect(
      FunnelAnalysisSummarySchema.safeParse({
        totalSessions: 100,
        convertedSessions: 25,
        totalVisitors: 80,
        convertedVisitors: 20,
        overallConversionRate: 25,
        largestDropOffStepIndex: 1,
      }).success,
    ).toBe(true);
  });

  it("accepts null largestDropOffStepIndex", () => {
    expect(
      FunnelAnalysisSummarySchema.safeParse({
        totalSessions: 10,
        convertedSessions: 10,
        totalVisitors: 10,
        convertedVisitors: 10,
        overallConversionRate: 100,
        largestDropOffStepIndex: null,
      }).success,
    ).toBe(true);
  });
});
