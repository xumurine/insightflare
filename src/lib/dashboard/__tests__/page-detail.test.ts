import { describe, expect, it } from "vitest";

import {
  buildPageDetailHref,
  normalizePagePath,
  PAGE_DETAIL_QUERY_PARAM,
  slugifyPagePath,
} from "@/lib/dashboard/page-detail";

describe("dashboard page detail helpers", () => {
  describe("normalizePagePath", () => {
    it("normalizes rooted page paths", () => {
      expect(normalizePagePath("/docs//guide/")).toBe("/docs/guide");
      expect(normalizePagePath(" /pricing/ ")).toBe("/pricing");
      expect(normalizePagePath("/")).toBe("/");
    });

    it("rejects missing and non-rooted values", () => {
      expect(normalizePagePath(null)).toBeNull();
      expect(normalizePagePath("")).toBeNull();
      expect(normalizePagePath("docs")).toBeNull();
    });
  });

  describe("slugifyPagePath", () => {
    it("creates stable slugs for root, normal, and symbolic paths", () => {
      expect(slugifyPagePath("/")).toBe("home");
      expect(slugifyPagePath("/Docs/Getting Started")).toBe(
        "docs-getting-started",
      );
      expect(slugifyPagePath("/---")).toBe("page");
      expect(slugifyPagePath("not-rooted")).toBe("page");
    });
  });

  describe("buildPageDetailHref", () => {
    it("trims trailing base slashes and encodes the normalized page path", () => {
      const href = buildPageDetailHref("/en/app/team/site/pages///", "/a b/");
      const url = new URL(href, "https://example.test");

      expect(url.pathname).toBe("/en/app/team/site/pages/detail");
      expect(url.searchParams.get(PAGE_DETAIL_QUERY_PARAM)).toBe("/a b");
    });

    it("falls back to the home page path when the detail page path is invalid", () => {
      expect(buildPageDetailHref("/pages", "not-rooted")).toBe(
        "/pages/detail?pagePath=%2F",
      );
    });
  });
});
