import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compareDemoNumericField,
  createDemoJourneyEvents,
  createDemoJourneyLocationPoints,
  createDemoJourneySession,
  demoAverageGapMs,
  demoJourneyPercentile,
  demoReportingDateKey,
  demoVisitsBySession,
  parseDemoSessionSort,
  parseDemoVisitorSort,
  summarizeDemoActivity,
  summarizeDemoEventDistribution,
  summarizeDemoVisitedPages,
} from "@/lib/realtime/mock/journey-helpers";
import type { DemoVisitFact } from "@/lib/realtime/mock/types";

describe("mock/journey-helpers coverage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sorts location points by visit time and drops invalid coordinates", () => {
    const visits = [
      makeVisit({
        visitId: "late",
        startedAt: 300,
        latitude: Number.NaN,
      }),
      makeVisit({
        visitId: "b",
        startedAt: 100,
        country: "DE",
        regionName: "",
        region: "BE",
        cityName: "",
        city: "Berlin",
        latitude: 52.52,
        longitude: 13.405,
      }),
      makeVisit({
        visitId: "a",
        startedAt: 100,
        country: "US",
        regionName: "California",
        regionCode: "CA",
        cityName: "San Francisco",
        latitude: 37.77,
        longitude: -122.42,
      }),
      makeVisit({
        visitId: "bad-lon",
        startedAt: 200,
        longitude: 181,
      }),
    ];

    expect(createDemoJourneyLocationPoints(visits)).toEqual([
      {
        latitude: 37.77,
        longitude: -122.42,
        timestampMs: 100,
        country: "US",
        region: "California",
        regionCode: "CA",
        city: "San Francisco",
      },
      {
        latitude: 52.52,
        longitude: 13.405,
        timestampMs: 100,
        country: "DE",
        region: "BE",
        regionCode: "",
        city: "Berlin",
      },
    ]);
  });

  it("builds a session from ordered visits with non-negative duration and geo fallback", () => {
    vi.useFakeTimers();
    vi.setSystemTime(600_000);
    const session = createDemoJourneySession("s1", [
      makeVisit({
        visitId: "last",
        startedAt: 400_000,
        pathname: "/checkout",
        durationMs: 2_000,
        latitude: 91,
        longitude: 0,
      }),
      makeVisit({
        visitId: "first",
        startedAt: 100_000,
        pathname: "/landing",
        durationMs: -500,
        eventType: "signup",
        screenSize: "390x844",
        latitude: 12,
        longitude: 34,
      }),
    ]);

    expect(session).toMatchObject({
      sessionId: "s1",
      visitorId: "visitor-1",
      startedAt: 100_000,
      endedAt: 402_000,
      durationMs: 2_000,
      active: true,
      views: 2,
      events: 1,
      bounce: false,
      entryPath: "/landing",
      exitPath: "/checkout",
      latitude: 12,
      longitude: 34,
      screenWidth: 390,
      screenHeight: 844,
    });
    expect(createDemoJourneySession("empty", [])).toBeNull();
  });

  it("groups visits by session without sorting or dropping entries", () => {
    const grouped = demoVisitsBySession([
      makeVisit({ visitId: "a", sessionId: "s1" }),
      makeVisit({ visitId: "b", sessionId: "s2" }),
      makeVisit({ visitId: "c", sessionId: "s1" }),
    ]);

    expect([...grouped.keys()]).toEqual(["s1", "s2"]);
    expect(grouped.get("s1")?.map((visit) => visit.visitId)).toEqual([
      "a",
      "c",
    ]);
  });

  it("creates page, custom, start, and inactive leave events in descending occurrence order", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10 * 60 * 1000);
    const events = createDemoJourneyEvents(
      [
        makeVisit({
          visitId: "early",
          startedAt: 1_000,
          durationMs: 500,
          eventType: "signup",
          pathname: "/start",
        }),
        makeVisit({
          visitId: "late",
          startedAt: 2_000,
          durationMs: -50,
          eventType: "pageview",
          pathname: "/end",
        }),
      ],
      { includeSessionStart: true, includeSessionEnd: true },
    );

    expect(events.map((event) => event.id)).toEqual([
      "session-leave:s1",
      "late",
      "early:signup",
      "session-start:s1",
      "early",
    ]);
    expect(events.find((event) => event.id === "late")).toMatchObject({
      kind: "pageview",
      durationMs: 0,
      pathname: "/end",
    });
    expect(events.find((event) => event.id === "early:signup")).toMatchObject({
      kind: "custom",
      eventType: "signup",
      occurredAt: 2_000,
    });
  });

  it("summarizes pages, event types, and activity with invalid events ignored", () => {
    const events = [
      { kind: "pageview", pathname: "/pricing", occurredAt: 1000 },
      { kind: "pageview", pathname: "   ", occurredAt: 2000 },
      { kind: "pageview", pathname: "/pricing", occurredAt: Number.NaN },
      { kind: "custom", eventType: "signup", occurredAt: 86_401_000 },
      { kind: "custom", kindOnly: true, occurredAt: -1 },
    ];

    expect(summarizeDemoVisitedPages(events)).toEqual([
      { pathname: "/pricing", views: 2 },
      { pathname: "/", views: 1 },
    ]);
    expect(summarizeDemoEventDistribution(events)).toEqual([
      { eventType: "pageview", count: 3 },
      { eventType: "custom", count: 1 },
      { eventType: "signup", count: 1 },
    ]);
    expect(summarizeDemoActivity(events, "UTC")).toEqual([
      { date: "1970-01-01", count: 2 },
      { date: "1970-01-02", count: 1 },
    ]);
    expect(demoReportingDateKey(Date.UTC(2026, 0, 1, 1), "UTC")).toBe(
      "2026-01-01",
    );
  });

  it("computes percentiles and average gaps from finite non-negative inputs", () => {
    expect(demoJourneyPercentile([50, -1, 10, Number.NaN, 30], 50)).toBe(30);
    expect(demoJourneyPercentile([10, 20, 30], 0)).toBe(10);
    expect(demoJourneyPercentile([10, 20, 30], 999)).toBe(30);
    expect(demoJourneyPercentile([], 95)).toBe(0);

    expect(demoAverageGapMs([100, 200, Number.POSITIVE_INFINITY, 500])).toBe(
      200,
    );
    expect(demoAverageGapMs([0, 100])).toBe(0);
  });

  it("parses sort options and compares numeric fields in both directions", () => {
    expect(
      parseDemoVisitorSort({ sortBy: "sessions", sortDir: "ASC" }),
    ).toEqual({
      key: "sessions",
      direction: "asc",
    });
    expect(parseDemoVisitorSort({ sortBy: "bad", sortDir: "asc" })).toEqual({
      key: "lastSeenAt",
      direction: "desc",
    });
    expect(parseDemoSessionSort({ sortBy: "views" })).toEqual({
      key: "views",
      direction: "desc",
    });
    expect(parseDemoSessionSort({ sortBy: "unknown" })).toEqual({
      key: "startedAt",
      direction: "desc",
    });

    expect(
      compareDemoNumericField({ views: 2 }, { views: 5 }, "views", "asc"),
    ).toBeLessThan(0);
    expect(
      compareDemoNumericField({ views: 2 }, { views: 5 }, "views", "desc"),
    ).toBeGreaterThan(0);
  });
});

function makeVisit(overrides: Partial<DemoVisitFact> = {}): DemoVisitFact {
  return {
    visitId: "visit-1",
    sessionId: "s1",
    visitorId: "visitor-1",
    startedAt: 0,
    pathname: "/home",
    title: "Home",
    hostname: "example.test",
    referrerHost: "",
    referrerUrl: "",
    browser: "Chrome",
    browserVersion: "138",
    osVersion: "Windows 11",
    deviceType: "Desktop",
    language: "en-US",
    screenSize: "1920x1080",
    country: "US",
    regionCode: "",
    regionName: "",
    region: "",
    cityName: "",
    city: "",
    continent: "North America",
    timezone: "UTC",
    organization: "Example ISP",
    latitude: 0,
    longitude: 0,
    eventType: "pageview",
    durationMs: 1000,
    ...overrides,
  };
}
