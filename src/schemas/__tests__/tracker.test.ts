import { describe, expect, it } from "vitest";

import { TrackerClientPayloadSchema } from "@/schemas/tracker";

describe("TrackerClientPayloadSchema", () => {
  const validPayload = {
    siteId: "s1",
    kind: "pageview" as const,
    visitId: "v1",
    pathname: "/home",
  };

  it("accepts a minimal pageview payload", () => {
    expect(TrackerClientPayloadSchema.safeParse(validPayload).success).toBe(
      true,
    );
  });

  it("accepts all kind variants", () => {
    for (const kind of [
      "pageview",
      "leave",
      "visibility",
      "custom_event",
      "identify",
    ]) {
      expect(
        TrackerClientPayloadSchema.safeParse({ ...validPayload, kind }).success,
      ).toBe(true);
    }
  });

  it("rejects invalid kind", () => {
    expect(
      TrackerClientPayloadSchema.safeParse({
        ...validPayload,
        kind: "scroll",
      }).success,
    ).toBe(false);
  });

  it("rejects visitId exceeding 128 chars", () => {
    expect(
      TrackerClientPayloadSchema.safeParse({
        ...validPayload,
        visitId: "x".repeat(129),
      }).success,
    ).toBe(false);
  });

  it("accepts optional fields", () => {
    expect(
      TrackerClientPayloadSchema.safeParse({
        ...validPayload,
        title: "Home Page",
        language: "en",
        timezone: "America/New_York",
        screenWidth: 1920,
        screenHeight: 1080,
        referrerUrl: "https://google.com",
        visitorId: "vis-1",
        userId: "user-1",
        userName: "John",
        durationMs: 5000,
        exitReason: "navigate",
        visibilityState: "hidden",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "spring",
      }).success,
    ).toBe(true);
  });

  it("accepts performance payload", () => {
    expect(
      TrackerClientPayloadSchema.safeParse({
        ...validPayload,
        performance: { ttfb: 100, fcp: 200, lcp: 500, cls: 0.05, inp: 50 },
      }).success,
    ).toBe(true);
  });

  it("accepts uaClientHints payload", () => {
    expect(
      TrackerClientPayloadSchema.safeParse({
        ...validPayload,
        uaClientHints: {
          brands: [{ brand: "Chrome", version: "120" }],
          mobile: false,
          platform: "Windows",
        },
      }).success,
    ).toBe(true);
  });

  it("accepts custom_event with eventName and eventData", () => {
    expect(
      TrackerClientPayloadSchema.safeParse({
        ...validPayload,
        kind: "custom_event",
        eventName: "button_click",
        eventData: { buttonId: "submit" },
      }).success,
    ).toBe(true);
  });

  it("rejects eventName exceeding 120 chars", () => {
    expect(
      TrackerClientPayloadSchema.safeParse({
        ...validPayload,
        kind: "custom_event",
        eventName: "x".repeat(121),
      }).success,
    ).toBe(false);
  });

  it("accepts visibility with visibilityState", () => {
    expect(
      TrackerClientPayloadSchema.safeParse({
        ...validPayload,
        kind: "visibility",
        visibilityState: "visible",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid visibilityState", () => {
    expect(
      TrackerClientPayloadSchema.safeParse({
        ...validPayload,
        kind: "visibility",
        visibilityState: "prerender",
      }).success,
    ).toBe(false);
  });
});
