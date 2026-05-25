import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildGeoTranslationApiUrl,
  fetchGeoCountryCodes,
  fetchGeoCountryTranslationPayload,
  fetchGeoStateTranslationBundle,
  fetchGeoStateTranslationPayload,
  formatLocalizedGeoValue,
  isGeoLabelCountryMatch,
  isGeoRegionCountryMatch,
  isSameGeoLabel,
  matchesGeoLabelRecord,
  normalizeGeoDisplayLabel,
  normalizeGeoTranslationLookupValue,
  parseGeoCountryTranslationPayload,
  parseGeoStateTranslationBundle,
  parseGeoStateTranslationPayload,
  pickLocaleGeoLabel,
  resolveGeoStateTranslation,
  resolveGeoTranslationApiLocale,
  resolveLocalizedCityName,
} from "@/lib/dashboard/geo-translation";

describe("Geographic Translation Utilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("resolveGeoTranslationApiLocale & buildGeoTranslationApiUrl", () => {
    it("should resolve API locale correctly", () => {
      expect(resolveGeoTranslationApiLocale("zh")).toBe("zh-CN");
      expect(resolveGeoTranslationApiLocale("en")).toBeNull();
    });

    it("should build translation API URL correctly", () => {
      expect(buildGeoTranslationApiUrl("zh-CN", "CN", "GD")).toBe(
        "https://locale.ravelloh.com/zh-CN/CN/GD/",
      );
      expect(buildGeoTranslationApiUrl("zh-CN")).toBe(
        "https://locale.ravelloh.com/zh-CN",
      );
    });
  });

  describe("Geo Translation Lookups and Matching", () => {
    it("should normalize geo lookup strings", () => {
      expect(
        normalizeGeoTranslationLookupValue("  Guangdong & Shenzhen  "),
      ).toBe("guangdong and shenzhen");
      expect(normalizeGeoTranslationLookupValue("St. John's")).toBe("st johns");
    });

    it("should match geo label records with aliases and spacing", () => {
      const record = {
        name: "Guangdong Province",
        name_default: "Guangdong",
        native: "广东省",
        iso2: "GD",
      };

      // Match raw name alias (stripping "Province")
      expect(matchesGeoLabelRecord(record, "guangdong")).toBe(true);
      // Match native
      expect(matchesGeoLabelRecord(record, "广东省")).toBe(true);
      // Match iso2
      expect(matchesGeoLabelRecord(record, "gd")).toBe(true);
      // Fails for unrelated string
      expect(matchesGeoLabelRecord(record, "unrelated")).toBe(false);
      // Fails gracefully for empty record
      expect(matchesGeoLabelRecord(null, "gd")).toBe(false);
    });

    it("should compare geographic labels for equivalence", () => {
      expect(isSameGeoLabel("Guangdong Province", "guangdong province")).toBe(
        true,
      );
      expect(isSameGeoLabel("  ", "   ")).toBe(false);
    });

    it("should match country labels and regions in payloads", () => {
      const countryPayload = {
        country: {
          name: "China",
          name_default: "China",
          native: "中国",
          code: "CN",
        },
      };

      expect(
        isGeoLabelCountryMatch({
          countryLabel: "CN",
          countryPayload,
          label: "China",
        }),
      ).toBe(true);
      expect(
        isGeoLabelCountryMatch({
          countryLabel: "US",
          countryPayload,
          label: "Beijing",
        }),
      ).toBe(false);

      expect(
        isGeoRegionCountryMatch({
          countryLabel: "CN",
          countryPayload,
          regionLabel: "中国",
        }),
      ).toBe(true);
    });
  });

  describe("pickLocaleGeoLabel", () => {
    const record = {
      name: "广东",
      name_default: "Guangdong Default",
      native: "广东省",
    };

    it("should return correct label based on locale choice", () => {
      expect(pickLocaleGeoLabel("zh", record)).toBe("广东省");
      expect(pickLocaleGeoLabel("en", record)).toBe("Guangdong Default");
      expect(pickLocaleGeoLabel("zh", null)).toBe("");
    });
  });

  describe("Payload Parsers", () => {
    it("should return null for malformed payloads", () => {
      expect(parseGeoCountryTranslationPayload(null)).toBeNull();
      expect(parseGeoStateTranslationPayload("not_object")).toBeNull();
    });

    it("should parse country payload correctly", () => {
      const payload = {
        country: { name: "China" },
        states: ["GD", "JS", null],
      };
      const parsed = parseGeoCountryTranslationPayload(payload);
      expect(parsed?.country).toEqual({ name: "China" });
      expect(parsed?.states).toEqual(["GD", "JS"]);
    });

    it("should parse state payload correctly", () => {
      const payload = {
        country: { name: "China" },
        state: { name: "Guangdong" },
        cities: [{ name: "Shenzhen" }, null],
      };
      const parsed = parseGeoStateTranslationPayload(payload);
      expect(parsed?.state).toEqual({ name: "Guangdong" });
      expect(parsed?.cities).toEqual([{ name: "Shenzhen" }]);
    });

    it("should parse state translation bundle correctly", () => {
      const payload = {
        country: { name: "China" },
        state: { name: "Guangdong", code: "GD" },
        cities: [
          { name: "Shenzhen", name_default: "Shenzhen", native: "深圳" },
          { name: "", name_default: "", native: "" }, // invalid city
        ],
      };
      const bundle = parseGeoStateTranslationBundle(payload);
      expect(bundle?.stateCode).toBe("GD");
      expect(bundle?.stateName).toBe("Guangdong");
      expect(bundle?.cities).toHaveLength(1);
      expect(bundle?.cities[0].name).toBe("Shenzhen");
    });
  });

  describe("Geographic Display Formatters", () => {
    it("should format display labels with fallbacks", () => {
      expect(normalizeGeoDisplayLabel("   ", "Unknown")).toBe("Unknown");
      expect(normalizeGeoDisplayLabel("Guangdong", "Unknown")).toBe(
        "Guangdong",
      );

      // Same label -> does not repeat
      expect(formatLocalizedGeoValue("Guangdong", "guangdong", "Unknown")).toBe(
        "Guangdong",
      );
      // Different labels -> formats combined
      expect(formatLocalizedGeoValue("广东省", "Guangdong", "Unknown")).toBe(
        "广东省 (Guangdong)",
      );
    });
  });

  describe("resolveLocalizedCityName", () => {
    it("should translate raw city names based on bundle cities records", () => {
      const bundle = {
        country: null,
        state: null,
        stateCode: "GD",
        stateName: "广东省",
        cities: [
          {
            name: "深圳",
            nameDefault: "Shenzhen",
            nativeName: "深圳",
            record: { name: "深圳", name_default: "Shenzhen", native: "深圳" },
          },
        ],
      };

      expect(resolveLocalizedCityName(bundle, "Shenzhen")).toBe("深圳");
      expect(resolveLocalizedCityName(bundle, "Beijing")).toBeNull();
      expect(resolveLocalizedCityName(bundle, "")).toBeNull();
      expect(resolveLocalizedCityName(null, "Shenzhen")).toBeNull();
    });
  });

  describe("API Fetchers and Cache Layer", () => {
    it("should fetch and cache geo country codes successfully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ["CN", "US", null],
      });
      vi.stubGlobal("fetch", mockFetch);

      const codes1 = await fetchGeoCountryCodes("zh-CN");
      expect(codes1).toEqual(["CN", "US"]);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Subsequent call hits cache
      const codes2 = await fetchGeoCountryCodes("zh-CN");
      expect(codes2).toEqual(["CN", "US"]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should handle failed country codes fetch gracefully", async () => {
      // Re-trigger by clear cached promise if possible, but cache is a module variable.
      // So we can mock fetch rejection or non-ok
      const mockFetch = vi.fn().mockResolvedValue({ ok: false });
      vi.stubGlobal("fetch", mockFetch);

      // If we use a different API locale or mock error paths, we can test error catch blocks
      const mockFetchError = vi
        .fn()
        .mockRejectedValue(new Error("Network Error"));
      vi.stubGlobal("fetch", mockFetchError);

      const payload = await fetchGeoCountryTranslationPayload(
        "zh-CN",
        "INVALID_CODE",
      );
      expect(payload).toBeNull();
    });

    it("should fetch country and state translation payloads and bundle", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("GD")) {
          // State payload
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                country: { name: "China" },
                state: { name: "Guangdong", code: "GD" },
                cities: [{ name: "Shenzhen", native: "深圳" }],
              }),
          });
        }
        // Country payload
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              country: { name: "China" },
              states: ["GD"],
            }),
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      const countryPayload = await fetchGeoCountryTranslationPayload(
        "zh-CN",
        "CN",
      );
      expect(countryPayload?.states).toEqual(["GD"]);

      const statePayload = await fetchGeoStateTranslationPayload(
        "zh-CN",
        "CN",
        "GD",
      );
      expect(statePayload?.state?.name).toBe("Guangdong");

      const bundle = await fetchGeoStateTranslationBundle("zh-CN", "CN", "GD");
      expect(bundle?.stateName).toBe("Guangdong");
      expect(bundle?.cities[0].nativeName).toBe("深圳");
    });
  });

  describe("resolveGeoStateTranslation Integration Flows", () => {
    it("should resolve state translations cleanly", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("GD")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                country: { name: "China", native: "中国" },
                state: { name: "Guangdong", code: "GD" },
                cities: [{ name: "Shenzhen", native: "深圳" }],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              country: { name: "China", native: "中国" },
              states: ["GD"],
            }),
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      // 1. Direct State Resolution Flow (with state code)
      const res1 = await resolveGeoStateTranslation("zh-CN", "CN", "GD");
      expect(res1?.stateCode).toBe("GD");
      expect(res1?.bundle?.stateName).toBe("Guangdong");

      // 2. Region / Locality Fallback Resolution Flow (without valid state code)
      const res2 = await resolveGeoStateTranslation("zh-CN", "CN", "", {
        regionLabel: "Guangdong",
        localityLabel: "Shenzhen",
      });
      expect(res2?.stateCode).toBe("GD");
      expect(res2?.regionMatchesCountry).toBe(false);

      // Edge case: null country
      expect(await resolveGeoStateTranslation("zh-CN", "", "")).toBeNull();
    });
  });
});
