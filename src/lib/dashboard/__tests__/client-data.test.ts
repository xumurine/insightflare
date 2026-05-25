/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";

import {
  decodeHashLabel,
  decodeQueryLabel,
  normalizeOverviewRows,
  toQueryString,
  withFilters,
} from "@/lib/dashboard/client-data";

describe("Dashboard Client Data Processing Utilities", () => {
  describe("normalizeOverviewRows", () => {
    it("should correctly normalize standard valid rows", () => {
      const input = [
        { label: "Chrome", views: 120, sessions: 60, visitors: 45 },
        { label: "Firefox", views: 40, sessions: 20, visitors: 15 },
      ];
      const result = normalizeOverviewRows(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        label: "Chrome",
        views: 120,
        sessions: 60,
        visitors: 45,
      });
      expect(result[1]).toEqual({
        label: "Firefox",
        views: 40,
        sessions: 20,
        visitors: 15,
      });
    });

    it("should safely fall back label to value if label is missing", () => {
      const input = [{ value: "Safari", views: 10 }];
      const result = normalizeOverviewRows(input);
      expect(result[0].label).toBe("Safari");
    });

    it("should handle missing fields and string values gracefully by fallback to zero", () => {
      const input = [{ label: "Opera", views: "50", sessions: undefined }];
      const result = normalizeOverviewRows(input);
      expect(result[0].views).toBe(50);
      expect(result[0].sessions).toBe(0);
      expect(result[0].visitors).toBe(0);
    });

    it("should return empty array for non-array inputs", () => {
      expect(normalizeOverviewRows(undefined)).toEqual([]);
      expect(normalizeOverviewRows(null as any)).toEqual([]);
      expect(normalizeOverviewRows({} as any)).toEqual([]);
    });
  });

  describe("decodeHashLabel & decodeQueryLabel", () => {
    it("should parse simple hashes and queries adding prefixes if missing", () => {
      expect(decodeHashLabel("pricing")).toBe("#pricing");
      expect(decodeHashLabel("#pricing")).toBe("#pricing");

      expect(decodeQueryLabel("ref=google")).toBe("?ref=google");
      expect(decodeQueryLabel("?ref=google")).toBe("?ref=google");
    });

    it("should decode encoded URL fragments correctly", () => {
      // %E4%B8%AD%E6%96%87 is "中文"
      expect(decodeHashLabel("%E4%B8%AD%E6%96%87")).toBe("#中文");
      expect(decodeQueryLabel("q=%E4%B8%AD%E6%96%87")).toBe("?q=中文");
    });

    it("should gracefully handle malformed URL encoding without crashing", () => {
      const malformed = "%E0%A%AB"; // Invalid URI sequence
      expect(decodeHashLabel(malformed)).toBe(`#${malformed}`);
      expect(decodeQueryLabel(malformed)).toBe(`?${malformed}`);
    });

    it("should return empty string for empty inputs", () => {
      expect(decodeHashLabel("")).toBe("");
      expect(decodeHashLabel("   ")).toBe("");
      expect(decodeQueryLabel(null as any)).toBe("");
    });
  });

  describe("toQueryString & withFilters", () => {
    it("should compile flat objects into valid URI query parameters", () => {
      const params = { siteId: "123", limit: 10 };
      expect(toQueryString(params)).toBe("?siteId=123&limit=10");
      expect(toQueryString({})).toBe("");
      expect(toQueryString(undefined)).toBe("");
    });

    it("should correctly map filters into request parameters object", () => {
      const baseParams = { siteId: "123" };
      const filters = {
        country: "US",
        browser: "Chrome",
        path: "/docs",
        eventPayloadFilters: [
          { path: "user.role", operator: "eq", value: "admin" },
        ],
      };

      const withResult = withFilters(baseParams, filters as any);
      expect(withResult.siteId).toBe("123");
      expect(withResult.country).toBe("US");
      expect(withResult.browser).toBe("Chrome");
      expect(withResult.path).toBe("/docs");
      expect(withResult.eventPayloadFilters).toBeTypeOf("string");
      expect(JSON.parse(withResult.eventPayloadFilters as string)).toEqual(
        filters.eventPayloadFilters,
      );
    });

    it("should skip mapping filters if filters object is empty or undefined", () => {
      const baseParams = { siteId: "123" };
      expect(withFilters(baseParams, undefined)).toEqual(baseParams);
    });
  });
});
