import { describe, expect, it } from "vitest";

import { emptyDemoFactDataset } from "@/lib/realtime/mock/fact-dataset";
import { applyDemoFilters } from "@/lib/realtime/mock/fact-filters";
import type {
  DemoFactDataset,
  DemoQueryFilters,
  DemoVisitFact,
} from "@/lib/realtime/mock/types";
import { demoQueryStringForVisit } from "@/lib/realtime/mock/visit-helpers";

describe("mock/fact-filters", () => {
  it("matches trimmed page, client, geo, and session dimensions", () => {
    const dataset = makeDataset([
      makeVisit({
        visitId: "match-1",
        sessionId: "s-match",
        visitorId: "u-match",
        pathname: " /pricing ",
        title: " Pricing ",
        hostname: " App.Example.Com ",
        browser: " Chrome ",
        osVersion: " Windows 11 ",
        deviceType: " Desktop ",
        language: " en-US ",
        screenSize: " 1920x1080 ",
        country: " us ",
        regionCode: " ca ",
        regionName: " California ",
        cityName: " San Francisco ",
        continent: " North America ",
        timezone: " America/Los_Angeles ",
        organization: " Cloudflare Inc. ",
      }),
      makeVisit({
        visitId: "miss-1",
        sessionId: "s-miss",
        visitorId: "u-miss",
        pathname: "/docs",
        title: "Docs",
        hostname: "docs.example.com",
        browser: "Safari",
        osVersion: "iOS 18",
        deviceType: "Mobile",
        language: "fr-FR",
        screenSize: "390x844",
        country: "FR",
        regionCode: "IDF",
        regionName: "Ile-de-France",
        cityName: "Paris",
        continent: "Europe",
        timezone: "Europe/Paris",
        organization: "Demo ISP",
      }),
    ]);
    dataset.sessions.set("s-match", {
      sessionId: "s-match",
      visitorId: "u-match",
      entryPath: " /pricing ",
      exitPath: " /checkout ",
      weight: 1,
    });
    dataset.sessions.set("s-miss", {
      sessionId: "s-miss",
      visitorId: "u-miss",
      entryPath: "/docs",
      exitPath: "/docs",
      weight: 1,
    });

    const filtered = applyDemoFilters(dataset, {
      country: "US",
      device: "Desktop",
      browser: "Chrome",
      path: "/pricing",
      title: "Pricing",
      hostname: "app.example.com",
      entry: "/pricing",
      exit: "/checkout",
      clientBrowser: "Chrome",
      clientOsVersion: "Windows 11",
      clientDeviceType: "Desktop",
      clientLanguage: "en-US",
      clientScreenSize: "1920x1080",
      geo: "US::CA::California::San Francisco",
      geoContinent: "North America",
      geoTimezone: "America/Los_Angeles",
      geoOrganization: "Cloudflare Inc.",
    });

    expect(filtered.visits.map((visit) => visit.visitId)).toEqual(["match-1"]);
    expect(filtered.sessions).toEqual(new Set(["s-match"]));
    expect(filtered.visitors).toEqual(new Set(["u-match"]));
    expect(filtered.visitsBySession.get("s-match")).toBe(1);
  });

  it.each([
    ["device", { device: "Mobile" }],
    ["path", { path: "/missing" }],
    ["title", { title: "Missing" }],
    ["hostname", { hostname: "other.example.com" }],
    ["clientBrowser", { clientBrowser: "Safari" }],
    ["clientOsVersion", { clientOsVersion: "macOS 15" }],
    ["clientDeviceType", { clientDeviceType: "Mobile" }],
    ["clientLanguage", { clientLanguage: "fr-FR" }],
    ["clientScreenSize", { clientScreenSize: "390x844" }],
    ["geoContinent", { geoContinent: "Europe" }],
    ["geoTimezone", { geoTimezone: "Europe/Paris" }],
    ["geoOrganization", { geoOrganization: "Other ISP" }],
    ["geo city", { geo: "US::CA::California::Los Angeles" }],
  ] satisfies Array<[string, DemoQueryFilters]>)(
    "excludes visits for a mismatched %s filter",
    (_label, filters) => {
      const dataset = makeDataset([
        makeVisit({
          visitId: "v1",
          sessionId: "s1",
          visitorId: "u1",
          pathname: "/pricing",
          title: "Pricing",
          hostname: "app.example.com",
          browser: "Chrome",
          osVersion: "Windows 11",
          deviceType: "Desktop",
          language: "en-US",
          screenSize: "1920x1080",
          country: "US",
          regionCode: "CA",
          regionName: "California",
          cityName: "San Francisco",
          continent: "North America",
          timezone: "America/Los_Angeles",
          organization: "Cloudflare Inc.",
        }),
      ]);

      expect(applyDemoFilters(dataset, filters).visits).toEqual([]);
    },
  );

  it("excludes visits when entry or exit filters point at missing sessions", () => {
    const dataset = emptyDemoFactDataset(0, 1);
    dataset.visits.push(
      makeVisit({ visitId: "v1", sessionId: "missing-session" }),
    );

    expect(applyDemoFilters(dataset, { entry: "/home" }).visits).toEqual([]);
    expect(applyDemoFilters(dataset, { exit: "/done" }).visits).toEqual([]);
  });

  it("filters source links by direct sentinel, host equality, URL fallback, and invalid URLs", () => {
    const dataset = makeDataset([
      makeVisit({
        visitId: "direct",
        referrerHost: "",
        referrerUrl: "",
      }),
      makeVisit({
        visitId: "url",
        referrerHost: "news.example.com",
        referrerUrl: "https://news.example.com/story",
      }),
      makeVisit({
        visitId: "host",
        referrerHost: "social.example.com",
        referrerUrl: "https://l.example.net/redirect",
      }),
      makeVisit({
        visitId: "other",
        referrerHost: "other.example.com",
        referrerUrl: "https://other.example.com/",
      }),
    ]);

    expect(
      applyDemoFilters(dataset, { sourceLink: "__direct__" }).visits.map(
        (visit) => visit.visitId,
      ),
    ).toEqual(["direct"]);
    expect(
      applyDemoFilters(dataset, {
        sourceLink: "https://news.example.com/story",
      }).visits.map((visit) => visit.visitId),
    ).toEqual(["url"]);
    expect(
      applyDemoFilters(dataset, {
        sourceLink: "social.example.com",
      }).visits.map((visit) => visit.visitId),
    ).toEqual(["host"]);
    expect(
      applyDemoFilters(dataset, {
        sourceLink: "https://social.example.com/somewhere",
      }).visits.map((visit) => visit.visitId),
    ).toEqual(["host"]);
    expect(
      applyDemoFilters(dataset, { sourceLink: "not a url" }).visits,
    ).toEqual([]);
  });

  it("filters generated query-string values exactly", () => {
    const matchingVisit = makeVisit({
      visitId: "q-match",
      pathname: "/pricing",
      title: "Pricing",
    });
    const dataset = makeDataset([
      matchingVisit,
      makeVisit({ visitId: "q-miss", pathname: "/", title: "Home" }),
    ]);

    let query = "";
    for (let index = 0; !query && index < 100; index += 1) {
      matchingVisit.visitId = `q-match-${index}`;
      query = demoQueryStringForVisit(matchingVisit);
    }
    expect(query).toBeTruthy();

    expect(
      applyDemoFilters(dataset, { query }).visits.map((visit) => visit.visitId),
    ).toEqual([matchingVisit.visitId]);
    expect(applyDemoFilters(dataset, { query: "?missing=1" }).visits).toEqual(
      [],
    );
  });
});

function makeDataset(visits: DemoVisitFact[]): DemoFactDataset {
  const dataset = emptyDemoFactDataset(0, 1);
  dataset.visits.push(...visits);
  for (const visit of visits) {
    dataset.sessions.set(visit.sessionId, {
      sessionId: visit.sessionId,
      visitorId: visit.visitorId,
      entryPath: visit.pathname,
      exitPath: visit.pathname,
      weight: 1,
    });
    dataset.visitors.set(visit.visitorId, {
      visitorId: visit.visitorId,
      weight: 1,
    });
  }
  return dataset;
}

function makeVisit(overrides: Partial<DemoVisitFact> = {}): DemoVisitFact {
  return {
    visitId: "v1",
    sessionId: "s1",
    visitorId: "u1",
    startedAt: 0,
    pathname: "/home",
    title: "Home",
    hostname: "example.com",
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
    continent: "",
    timezone: "",
    organization: "",
    latitude: 0,
    longitude: 0,
    eventType: "pageview",
    durationMs: 0,
    ...overrides,
  };
}
