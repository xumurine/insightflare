import { describe, expect, it } from "vitest";

import {
  DEMO_DIRECT_REFERRER_FILTER_VALUE,
  DEMO_INTERVALS,
  demoValuesIncludeSearch,
  normalizeDemoFilterValue,
  normalizeDemoSearch,
  parseDemoBoolean,
  parseDemoFilters,
  parseDemoGeoFilterValue,
  parseDemoInterval,
  parseDemoLimit,
  parseDemoNumber,
  withoutDemoGeoFilter,
} from "@/lib/realtime/mock/filters";

describe("mock/filters", () => {
  describe("constants", () => {
    it("exposes the direct referrer sentinel", () => {
      expect(DEMO_DIRECT_REFERRER_FILTER_VALUE).toBe("__direct__");
    });

    it("declares the valid set of intervals", () => {
      expect(DEMO_INTERVALS.has("minute")).toBe(true);
      expect(DEMO_INTERVALS.has("hour")).toBe(true);
      expect(DEMO_INTERVALS.has("day")).toBe(true);
      expect(DEMO_INTERVALS.has("week")).toBe(true);
      expect(DEMO_INTERVALS.has("month")).toBe(true);
      expect(DEMO_INTERVALS.has("year")).toBe(false);
    });
  });

  describe("normalizeDemoFilterValue", () => {
    it("returns undefined for nullish or sentinel values", () => {
      expect(normalizeDemoFilterValue(undefined)).toBeUndefined();
      expect(normalizeDemoFilterValue("")).toBeUndefined();
      expect(normalizeDemoFilterValue("   ")).toBeUndefined();
      expect(normalizeDemoFilterValue("all")).toBeUndefined();
      expect(normalizeDemoFilterValue("ALL")).toBeUndefined();
      expect(normalizeDemoFilterValue("null")).toBeUndefined();
      expect(normalizeDemoFilterValue("undefined")).toBeUndefined();
    });

    it("trims and clips strings to 120 characters", () => {
      expect(normalizeDemoFilterValue("  US ")).toBe("US");
      const long = "a".repeat(200);
      expect(normalizeDemoFilterValue(long)).toHaveLength(120);
    });

    it("coerces numeric inputs to strings", () => {
      expect(normalizeDemoFilterValue(42)).toBe("42");
    });
  });

  describe("parseDemoFilters", () => {
    it("returns undefined for absent dimensions", () => {
      const filters = parseDemoFilters({});
      expect(filters.country).toBeUndefined();
      expect(filters.geo).toBeUndefined();
      expect(filters.eventPayloadFilters).toBeUndefined();
    });

    it("captures every supported dimension key", () => {
      const filters = parseDemoFilters({
        country: "US",
        device: "Mobile",
        browser: "Chrome",
        path: "/pricing",
        query: "?utm_source=newsletter",
        title: "Home",
        hostname: "example.com",
        entry: "/",
        exit: "/checkout",
        sourceDomain: "google.com",
        sourceLink: "https://google.com/search",
        clientBrowser: "Safari",
        clientOsVersion: "iOS 18",
        clientDeviceType: "Mobile",
        clientLanguage: "en-US",
        clientScreenSize: "390x844",
        geoContinent: "North America",
        geoTimezone: "America/New_York",
        geoOrganization: "Cloudflare Inc.",
      });
      expect(filters.country).toBe("US");
      expect(filters.device).toBe("Mobile");
      expect(filters.browser).toBe("Chrome");
      expect(filters.path).toBe("/pricing");
      expect(filters.title).toBe("Home");
      expect(filters.entry).toBe("/");
      expect(filters.exit).toBe("/checkout");
      expect(filters.sourceDomain).toBe("google.com");
      expect(filters.clientBrowser).toBe("Safari");
      expect(filters.clientScreenSize).toBe("390x844");
      expect(filters.geoContinent).toBe("North America");
      expect(filters.geoOrganization).toBe("Cloudflare Inc.");
    });

    it("prefers `geo` over `geoCountry`/`geoRegion`/`geoCity`", () => {
      expect(parseDemoFilters({ geo: "US::CA::California" }).geo).toBe(
        "US::CA::California",
      );
      expect(parseDemoFilters({ geoCity: "US::NY::New York::NYC" }).geo).toBe(
        "US::NY::New York::NYC",
      );
      expect(
        parseDemoFilters({ geoCountry: "US", geoRegion: "US::CA" }).geo,
      ).toBe("US");
    });

    it("parses event payload filters JSON", () => {
      const filters = parseDemoFilters({
        eventPayloadFilters: JSON.stringify([
          { path: "/foo", operator: "eq", value: "bar" },
          { path: "$.amount[*]", operator: "ne", value: 100 },
        ]),
      });
      expect(filters.eventPayloadFilters).toEqual([
        { path: "/foo", operator: "eq", value: "bar" },
        { path: "/amount/*", operator: "ne", value: 100 },
      ]);
    });

    it("ignores invalid event payload filters JSON", () => {
      const filters = parseDemoFilters({
        eventPayloadFilters: "not json",
      });
      expect(filters.eventPayloadFilters).toBeUndefined();
    });

    it("returns undefined when event payload filters is not an array", () => {
      expect(
        parseDemoFilters({ eventPayloadFilters: JSON.stringify({ foo: 1 }) })
          .eventPayloadFilters,
      ).toBeUndefined();
    });

    it("drops invalid event payload entries (missing path or value)", () => {
      const filters = parseDemoFilters({
        eventPayloadFilters: JSON.stringify([
          { path: "/", operator: "eq", value: "ignored" },
          { path: "", operator: "eq", value: "ignored" },
          { path: "/ok", operator: "eq", value: "ok" },
          { path: "/no-value", operator: "eq" },
          { path: "/null-value", operator: "ne", value: null },
          { path: "/bool", operator: "eq", value: true },
          null,
          "not-an-object",
          { operator: "eq", value: "ignored" },
        ]),
      });
      expect(filters.eventPayloadFilters).toEqual([
        { path: "/ok", operator: "eq", value: "ok" },
        { path: "/null-value", operator: "ne", value: null },
        { path: "/bool", operator: "eq", value: true },
      ]);
    });

    it("returns undefined when no event payload rules survive", () => {
      const filters = parseDemoFilters({
        eventPayloadFilters: JSON.stringify([
          { path: "", operator: "eq", value: "ignored" },
        ]),
      });
      expect(filters.eventPayloadFilters).toBeUndefined();
    });

    it("normalizes dot-path expressions and trims to 240 chars", () => {
      const longValue = "x".repeat(500);
      const filters = parseDemoFilters({
        eventPayloadFilters: JSON.stringify([
          { path: "$.items[0].name", operator: "ne", value: longValue },
        ]),
      });
      expect(filters.eventPayloadFilters?.[0]?.path).toBe("/items/*/name");
      expect(
        String(filters.eventPayloadFilters?.[0]?.value ?? "").length,
      ).toBeLessThanOrEqual(240);
    });

    it("ignores entries whose value is an object/array (unsupported types)", () => {
      const filters = parseDemoFilters({
        eventPayloadFilters: JSON.stringify([
          { path: "/n", operator: "eq", value: { nested: true } },
          { path: "/arr", operator: "eq", value: [1, 2] },
          { path: "/ok", operator: "eq", value: 7 },
        ]),
      });
      expect(filters.eventPayloadFilters).toEqual([
        { path: "/ok", operator: "eq", value: 7 },
      ]);
    });

    it("caps event payload rules at 12 entries", () => {
      const raw = Array.from({ length: 20 }, (_, i) => ({
        path: `/p${i}`,
        operator: "eq",
        value: i,
      }));
      const filters = parseDemoFilters({
        eventPayloadFilters: JSON.stringify(raw),
      });
      expect(filters.eventPayloadFilters?.length).toBe(12);
    });

    it("maps `!=` operator to `ne`", () => {
      const filters = parseDemoFilters({
        eventPayloadFilters: JSON.stringify([
          { path: "/x", operator: "!=", value: 1 },
        ]),
      });
      expect(filters.eventPayloadFilters?.[0]?.operator).toBe("ne");
    });
  });

  describe("normalizeDemoSearch", () => {
    it("prefers `search`, falls back to `q`, default empty", () => {
      expect(normalizeDemoSearch({ search: " Foo " })).toBe("foo");
      expect(normalizeDemoSearch({ q: "BAR" })).toBe("bar");
      expect(normalizeDemoSearch({})).toBe("");
    });
  });

  describe("demoValuesIncludeSearch", () => {
    it("returns true when search is empty", () => {
      expect(demoValuesIncludeSearch("", ["foo"])).toBe(true);
    });

    it("returns true when any value contains the search substring (case-insensitive)", () => {
      expect(demoValuesIncludeSearch("oo", ["FoO", "bar"])).toBe(true);
      expect(demoValuesIncludeSearch("zzz", ["bar", null])).toBe(false);
    });
  });

  describe("withoutDemoGeoFilter", () => {
    it("clears the `geo` field but preserves other filters", () => {
      const filters = parseDemoFilters({
        country: "US",
        geo: "US::CA::California",
      });
      const stripped = withoutDemoGeoFilter(filters);
      expect(stripped.geo).toBeUndefined();
      expect(stripped.country).toBe("US");
    });
  });

  describe("parseDemoGeoFilterValue", () => {
    it("returns null for empty input", () => {
      expect(parseDemoGeoFilterValue(undefined)).toBeNull();
      expect(parseDemoGeoFilterValue("")).toBeNull();
      expect(parseDemoGeoFilterValue("   ")).toBeNull();
    });

    it("returns null when the country segment is empty", () => {
      expect(parseDemoGeoFilterValue("::CA::California")).toBeNull();
    });

    it("parses a country-only value (uppercased)", () => {
      expect(parseDemoGeoFilterValue("us")).toEqual({ country: "US" });
    });

    it("parses a country+city two-segment value", () => {
      expect(parseDemoGeoFilterValue("US::Boston")).toEqual({
        country: "US",
        city: "Boston",
      });
    });

    it("treats trailing empty city segment as country-only", () => {
      expect(parseDemoGeoFilterValue("US::")).toEqual({ country: "US" });
    });

    it("parses a full region+city value", () => {
      expect(
        parseDemoGeoFilterValue("US::CA::California::Los Angeles"),
      ).toEqual({
        country: "US",
        regionCode: "CA",
        regionName: "California",
        city: "Los Angeles",
      });
    });

    it("re-joins multi-segment city names", () => {
      expect(
        parseDemoGeoFilterValue("US::NY::New York::New York::City"),
      ).toEqual({
        country: "US",
        regionCode: "NY",
        regionName: "New York",
        city: "New York::City",
      });
    });

    it("omits empty optional segments", () => {
      expect(parseDemoGeoFilterValue("US::CA::California")).toEqual({
        country: "US",
        regionCode: "CA",
        regionName: "California",
      });
    });
  });

  describe("parseDemoNumber", () => {
    it("returns numeric input as-is when finite", () => {
      expect(parseDemoNumber(42, 0)).toBe(42);
      expect(parseDemoNumber(-3.14, 0)).toBe(-3.14);
    });

    it("parses string numbers, falls back otherwise", () => {
      expect(parseDemoNumber("17", 0)).toBe(17);
      expect(parseDemoNumber("abc", 99)).toBe(99);
      expect(parseDemoNumber(undefined, 5)).toBe(5);
    });

    it("rejects infinite/NaN numeric inputs", () => {
      expect(parseDemoNumber(Number.POSITIVE_INFINITY, 12)).toBe(12);
      expect(parseDemoNumber(Number.NaN, 7)).toBe(7);
    });
  });

  describe("parseDemoLimit", () => {
    it("clamps within [min, max] and floors to integer", () => {
      expect(parseDemoLimit("20.7", 10, 5, 50)).toBe(20);
      expect(parseDemoLimit(3, 10, 5, 50)).toBe(5);
      expect(parseDemoLimit(99, 10, 5, 50)).toBe(50);
    });

    it("uses fallback when the value is not parseable", () => {
      expect(parseDemoLimit(undefined, 8, 1, 30)).toBe(8);
      expect(parseDemoLimit("bad", 8, 1, 30)).toBe(8);
    });
  });

  describe("parseDemoBoolean", () => {
    it("treats common truthy forms as true", () => {
      expect(parseDemoBoolean(1)).toBe(true);
      expect(parseDemoBoolean("1")).toBe(true);
      expect(parseDemoBoolean("true")).toBe(true);
      expect(parseDemoBoolean("YES")).toBe(true);
      expect(parseDemoBoolean(" True ")).toBe(true);
    });

    it("treats everything else as false", () => {
      expect(parseDemoBoolean(0)).toBe(false);
      expect(parseDemoBoolean("0")).toBe(false);
      expect(parseDemoBoolean("false")).toBe(false);
      expect(parseDemoBoolean(undefined)).toBe(false);
      expect(parseDemoBoolean("maybe")).toBe(false);
    });
  });

  describe("parseDemoInterval", () => {
    it("returns the parsed interval when valid", () => {
      expect(parseDemoInterval("minute")).toBe("minute");
      expect(parseDemoInterval(" HOUR ")).toBe("hour");
      expect(parseDemoInterval("week")).toBe("week");
      expect(parseDemoInterval("month")).toBe("month");
    });

    it("falls back to `day` for unknown values", () => {
      expect(parseDemoInterval(undefined)).toBe("day");
      expect(parseDemoInterval("year")).toBe("day");
    });
  });
});
