import { describe, expect, it } from "vitest";

import {
  mergeUaClientHintsIntoHeaders,
  normalizeTrackerUaClientHints,
} from "@/lib/edge/client-hints";

describe("tracker UA client hints normalization", () => {
  it("returns undefined for empty, non-object, and empty-normalized inputs", () => {
    expect(normalizeTrackerUaClientHints(null)).toBeUndefined();
    expect(normalizeTrackerUaClientHints([])).toBeUndefined();
    expect(
      normalizeTrackerUaClientHints({ brands: [{ brand: "", version: "" }] }),
    ).toBeUndefined();
  });

  it("trims, filters, and caps client hint fields", () => {
    const normalized = normalizeTrackerUaClientHints({
      brands: [
        { brand: " Chromium ", version: " 124 " },
        { brand: "", version: "1" },
        null,
      ],
      fullVersionList: Array.from({ length: 10 }, (_, index) => ({
        brand: `Brand ${index}`,
        version: `${index}`,
      })),
      mobile: false,
      platform: " macOS ",
      platformVersion: " 15.1 ",
      model: " MacBook Pro ".repeat(20),
      formFactors: [" Desktop ", "", " XR "],
    });

    expect(normalized?.brands).toEqual([{ brand: "Chromium", version: "124" }]);
    expect(normalized?.fullVersionList).toHaveLength(8);
    expect(normalized?.mobile).toBe(false);
    expect(normalized?.platform).toBe("macOS");
    expect(normalized?.platformVersion).toBe("15.1");
    expect(normalized?.model).toHaveLength(120);
    expect(normalized?.formFactors).toEqual(["Desktop", "XR"]);
  });

  it("serializes normalized hints into structured headers without mutating the input headers", () => {
    const headers = { "content-type": "application/json" };
    const merged = mergeUaClientHintsIntoHeaders(headers, {
      brands: [{ brand: 'Chrom"ium', version: "124\\1" }],
      mobile: true,
      platform: "Windows",
      platformVersion: "15.0",
      model: "Surface",
      fullVersionList: [{ brand: "Chromium", version: "124.0.1" }],
      formFactors: ["Desktop", "Foldable"],
    });

    expect(headers).toEqual({ "content-type": "application/json" });
    expect(merged["content-type"]).toBe("application/json");
    expect(merged["sec-ch-ua"]).toBe('"Chrom\\"ium";v="124\\\\1"');
    expect(merged["sec-ch-ua-mobile"]).toBe("?1");
    expect(merged["sec-ch-ua-platform"]).toBe('"Windows"');
    expect(merged["sec-ch-ua-platform-version"]).toBe('"15.0"');
    expect(merged["sec-ch-ua-model"]).toBe('"Surface"');
    expect(merged["sec-ch-ua-full-version-list"]).toBe(
      '"Chromium";v="124.0.1"',
    );
    expect(merged["sec-ch-ua-form-factors"]).toBe('"Desktop", "Foldable"');
  });

  it("returns the same headers object when hints normalize to nothing", () => {
    const headers = { existing: "1" };
    expect(mergeUaClientHintsIntoHeaders(headers, {})).toBe(headers);
  });
});
