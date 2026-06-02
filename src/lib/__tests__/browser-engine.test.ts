import { describe, expect, it } from "vitest";

import { browserEngineCaseSql, browserEngineLabel } from "@/lib/browser-engine";

describe("User Agent Browser Engine Classifier", () => {
  describe("browserEngineLabel", () => {
    it("should return an empty string for empty browser strings", () => {
      expect(browserEngineLabel("")).toBe("");
    });

    it("should classify Internet Explorer / Trident correctly", () => {
      expect(browserEngineLabel("Internet Explorer")).toBe("Trident");
      expect(browserEngineLabel("ie")).toBe("Trident");
      expect(browserEngineLabel("TRIDENT")).toBe("Trident");
    });

    it("should force WebKit for any browser running on iOS due to Apple constraints", () => {
      expect(browserEngineLabel("Chrome", "iOS")).toBe("WebKit");
      expect(browserEngineLabel("Firefox", "ios")).toBe("WebKit");
      expect(browserEngineLabel("Safari", "iOS 15")).toBe("WebKit");
    });

    it("should classify Opera Mini / Presto correctly", () => {
      expect(browserEngineLabel("Opera Mini")).toBe("Presto");
      expect(browserEngineLabel("Presto")).toBe("Presto");
    });

    it("should classify Firefox / Gecko correctly", () => {
      expect(browserEngineLabel("Firefox")).toBe("Gecko");
      expect(browserEngineLabel("gecko")).toBe("Gecko");
    });

    it("should classify Chromium and derivative browsers as Blink engine", () => {
      expect(browserEngineLabel("Chrome")).toBe("Blink");
      expect(browserEngineLabel("Chromium")).toBe("Blink");
      expect(browserEngineLabel("Edge")).toBe("Blink");
      expect(browserEngineLabel("Edg")).toBe("Blink");
      expect(browserEngineLabel("Opera")).toBe("Blink");
      expect(browserEngineLabel("opr")).toBe("Blink");
      expect(browserEngineLabel("Brave")).toBe("Blink");
      expect(browserEngineLabel("Vivaldi")).toBe("Blink");
      expect(browserEngineLabel("Arc")).toBe("Blink");
      expect(browserEngineLabel("Samsung Internet")).toBe("Blink");
      expect(browserEngineLabel("WebView")).toBe("Blink");
      expect(browserEngineLabel("Yandex")).toBe("Blink");
      expect(browserEngineLabel("UC Browser")).toBe("Blink");
      expect(browserEngineLabel("DuckDuckGo")).toBe("Blink");
      expect(browserEngineLabel("Whale")).toBe("Blink");
      expect(browserEngineLabel("QQBrowser")).toBe("Blink");
      expect(browserEngineLabel("Miui Browser")).toBe("Blink");
      expect(browserEngineLabel("Coc Coc")).toBe("Blink");
    });

    it("should classify standard Safari and webkit strings as WebKit (when not iOS)", () => {
      expect(browserEngineLabel("Safari", "macOS")).toBe("WebKit");
      expect(browserEngineLabel("WebKit", "Windows")).toBe("WebKit");
    });

    it("should return empty string for unclassified/unknown browsers", () => {
      expect(browserEngineLabel("MyCustomCrawler")).toBe("");
      expect(browserEngineLabel("curl")).toBe("");
    });
  });

  describe("browserEngineCaseSql", () => {
    it("should generate a CASE WHEN SQL string using standard column names", () => {
      const sql = browserEngineCaseSql("browser");
      expect(sql).toContain("CASE");
      expect(sql).toContain("LOWER(TRIM(COALESCE(browser, '')))");
      expect(sql).toContain("Trident");
      expect(sql).toContain("Blink");
      expect(sql).toContain("WebKit");
      expect(sql).toContain("Gecko");
      expect(sql).toContain("Presto");
      expect(sql).toContain("END");
    });

    it("should substitute custom OS columns when provided", () => {
      const sql = browserEngineCaseSql("u.browser_name", "u.operating_system");
      expect(sql).toContain("LOWER(TRIM(COALESCE(u.operating_system, '')))");
      expect(sql).toContain("u.browser_name");
      expect(sql).toContain("LIKE '%ios%' THEN 'WebKit'");
    });

    it("should default the OS to empty string when not provided in the parameters", () => {
      const sql = browserEngineCaseSql("browser");
      // When OS column is not supplied, it injects "''" for osColumn representation
      expect(sql).toContain("WHEN '' LIKE '%ios%' THEN 'WebKit'");
    });
  });
});
