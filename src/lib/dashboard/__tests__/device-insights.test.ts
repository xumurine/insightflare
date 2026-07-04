import { describe, expect, it } from "vitest";

import {
  aggregateScreenBuckets,
  classifyScreenBucket,
  parseScreenSizeLabel,
  pickTopCrossCell,
  pickTopVisibleSeries,
} from "@/lib/dashboard/device-insights";

describe("Dashboard Device Insights Utilities", () => {
  describe("parseScreenSizeLabel", () => {
    it("should successfully parse standard formatted resolution labels", () => {
      expect(parseScreenSizeLabel("1920x1080")).toEqual({
        width: 1920,
        height: 1080,
        viewportWidth: 1080,
      });

      expect(parseScreenSizeLabel("360x800")).toEqual({
        width: 360,
        height: 800,
        viewportWidth: 360,
      });
    });

    it("should handle whitespaces and case-insensitivity in labels", () => {
      expect(parseScreenSizeLabel("  1280X800  ")).toEqual({
        width: 1280,
        height: 800,
        viewportWidth: 800,
      });
    });

    it("should return null for invalid, non-matching or nullish inputs", () => {
      expect(parseScreenSizeLabel("")).toBeNull();
      expect(parseScreenSizeLabel(null as any)).toBeNull();
      expect(parseScreenSizeLabel(undefined as any)).toBeNull();
      expect(parseScreenSizeLabel("abc")).toBeNull();
      expect(parseScreenSizeLabel("1920")).toBeNull();
    });

    it("should return null for resolutions exceeding 2-5 digit constraint", () => {
      expect(parseScreenSizeLabel("9x9")).toBeNull(); // Under 2 digits
      expect(parseScreenSizeLabel("100000x1080")).toBeNull(); // Over 5 digits
    });

    it("should return null for zero or negative dimensions", () => {
      expect(parseScreenSizeLabel("0x1080")).toBeNull();
      expect(parseScreenSizeLabel("1920x0")).toBeNull();
      expect(parseScreenSizeLabel("-1920x1080")).toBeNull();
    });
  });

  describe("classifyScreenBucket", () => {
    it("should classify screens based on viewportWidth boundaries", () => {
      // phoneCompact: viewportWidth < 400
      expect(classifyScreenBucket("360x640")).toBe("phoneCompact");
      expect(classifyScreenBucket("390x844")).toBe("phoneCompact");

      // phone: 400 <= viewportWidth < 768
      expect(classifyScreenBucket("412x915")).toBe("phone");
      expect(classifyScreenBucket("767x1024")).toBe("phone");

      // tablet: 768 <= viewportWidth < 1024
      expect(classifyScreenBucket("768x1024")).toBe("tablet");
      expect(classifyScreenBucket("1024x768")).toBe("tablet"); // Min dimension is 768
      expect(classifyScreenBucket("1023x1366")).toBe("tablet");

      // laptop: 1024 <= viewportWidth < 1440
      expect(classifyScreenBucket("1280x1024")).toBe("laptop"); // Min is 1024
      expect(classifyScreenBucket("1920x1080")).toBe("laptop"); // Min is 1080

      // desktopWide: viewportWidth >= 1440
      expect(classifyScreenBucket("2560x1440")).toBe("desktopWide");
      expect(classifyScreenBucket("3840x2160")).toBe("desktopWide");
    });

    it("should classify invalid resolution labels as unclassified", () => {
      expect(classifyScreenBucket("")).toBe("unclassified");
      expect(classifyScreenBucket("invalid-res")).toBe("unclassified");
    });
  });

  describe("aggregateScreenBuckets", () => {
    it("should return empty metrics for empty browser series list", () => {
      const result = aggregateScreenBuckets([]);
      expect(result.buckets).toHaveLength(0);
      expect(result.totalVisitors).toBe(0);
      expect(result.classifiedVisitors).toBe(0);
    });

    it("should correctly aggregate visitor counts across viewport buckets", () => {
      const series: any[] = [
        { label: "1920x1080", visitors: 100, isOther: false }, // laptop
        { label: "1280x800", visitors: 50, isOther: false }, // tablet (min is 800)
        { label: "360x640", visitors: 30, isOther: false }, // phoneCompact
        { label: "invalid", visitors: 20, isOther: false }, // unclassified
      ];

      const result = aggregateScreenBuckets(series);
      expect(result.totalVisitors).toBe(200);

      // Verify laptop bucket
      const laptop = result.buckets.find((b) => b.key === "laptop");
      expect(laptop?.visitors).toBe(100);
      expect(laptop?.share).toBe(0.5);

      // Verify unclassified bucket
      const unclassified = result.buckets.find((b) => b.key === "unclassified");
      expect(unclassified?.visitors).toBe(200 - 100 - 50 - 30); // 20

      // classifiedVisitors excludes unclassified
      expect(result.classifiedVisitors).toBe(180);
    });

    it("should treat items with isOther as unclassified bucket items", () => {
      const series: any[] = [
        { label: "1920x1080", visitors: 100, isOther: true }, // Marks as Other
        { label: "360x640", visitors: 50, isOther: false },
      ];

      const result = aggregateScreenBuckets(series);
      const unclassified = result.buckets.find((b) => b.key === "unclassified");
      expect(unclassified?.visitors).toBe(100);
      expect(result.classifiedVisitors).toBe(50);
    });

    it("should filter out buckets with zero total aggregated visitors", () => {
      const series: any[] = [{ label: "360x640", visitors: 0, isOther: false }];
      const result = aggregateScreenBuckets(series);
      expect(result.buckets).toHaveLength(0);
    });
  });

  describe("pickTopVisibleSeries", () => {
    it("should return null for empty series list", () => {
      expect(pickTopVisibleSeries([])).toBeNull();
    });

    it("should choose the non-other series with maximum visitors", () => {
      const series: any[] = [
        { label: "Chrome", visitors: 50, isOther: false },
        { label: "Safari", visitors: 80, isOther: false },
        { label: "Others", visitors: 150, isOther: true },
      ];
      const top = pickTopVisibleSeries(series);
      expect(top?.label).toBe("Safari");
    });

    it("should fall back to other series if all series in list are other", () => {
      const series: any[] = [{ label: "Others", visitors: 150, isOther: true }];
      const top = pickTopVisibleSeries(series);
      expect(top?.label).toBe("Others");
    });
  });

  describe("pickTopCrossCell", () => {
    it("should return null for empty cross breakdown grid", () => {
      const grid = { rows: [], totalVisitors: 0 } as any;
      expect(pickTopCrossCell(grid)).toBeNull();
    });

    it("should find the cell with highest visitor count ignoring special flags", () => {
      const grid: any = {
        totalVisitors: 100,
        rows: [
          {
            label: "US",
            cells: [
              {
                label: "Chrome",
                visitors: 40,
                isOther: false,
                isUnknown: false,
              },
              {
                label: "Firefox",
                visitors: 10,
                isOther: false,
                isUnknown: false,
              },
            ],
          },
          {
            label: "CN",
            cells: [
              {
                label: "Safari",
                visitors: 30,
                isOther: false,
                isUnknown: false,
              },
              {
                label: "Others",
                visitors: 99,
                isOther: true,
                isUnknown: false,
              }, // Ignored (isOther)
              {
                label: "Unknown",
                visitors: 85,
                isOther: false,
                isUnknown: true,
              }, // Ignored (isUnknown)
            ],
          },
        ],
      };

      const top = pickTopCrossCell(grid);
      expect(top).toEqual({
        primaryLabel: "US",
        secondaryLabel: "Chrome",
        visitors: 40,
        share: 0.4,
      });
    });

    it("should return null if all cell values are zero or flagged as special", () => {
      const grid: any = {
        totalVisitors: 50,
        rows: [
          {
            label: "US",
            cells: [
              {
                label: "Chrome",
                visitors: 0,
                isOther: false,
                isUnknown: false,
              },
              {
                label: "Others",
                visitors: 40,
                isOther: true,
                isUnknown: false,
              },
            ],
          },
        ],
      };
      expect(pickTopCrossCell(grid)).toBeNull();
    });
  });
});
