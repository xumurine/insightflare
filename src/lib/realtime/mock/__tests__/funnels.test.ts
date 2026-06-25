import { describe, expect, it } from "vitest";

import {
  createDemoFunnel,
  deleteDemoFunnel,
  generateDemoFunnels,
} from "@/lib/realtime/mock/funnels";

const SITE_ID = "demo-site-001";

describe("mock/funnels", () => {
  describe("generateDemoFunnels", () => {
    it("returns a list of funnels when no id param is provided", () => {
      const result = generateDemoFunnels(SITE_ID, {});
      expect(result.ok).toBe(true);
      expect("funnels" in result).toBe(true);
      if ("funnels" in result) {
        expect(result.funnels.length).toBeGreaterThanOrEqual(2);
        for (const funnel of result.funnels) {
          expect(funnel.siteId).toBe(SITE_ID);
          expect(funnel.steps.length).toBeGreaterThanOrEqual(2);
        }
      }
    });

    it("returns detail with analysis when a matching id is provided", () => {
      const list = generateDemoFunnels(SITE_ID, {});
      const firstId = "funnels" in list ? list.funnels[0]?.id : undefined;
      expect(firstId).toBeDefined();

      const detail = generateDemoFunnels(SITE_ID, { id: firstId! });
      expect(detail.ok).toBe(true);
      expect("funnel" in detail).toBe(true);
      expect("analysis" in detail).toBe(true);
      if ("analysis" in detail) {
        expect(detail.analysis.steps.length).toBeGreaterThan(0);
        expect(detail.analysis.summary.totalSessions).toBeGreaterThan(0);
        expect(
          detail.analysis.summary.convertedSessions,
        ).toBeGreaterThanOrEqual(0);
        expect(
          detail.analysis.summary.overallConversionRate,
        ).toBeGreaterThanOrEqual(0);
        expect(
          detail.analysis.summary.overallConversionRate,
        ).toBeLessThanOrEqual(1);
      }
    });

    it("falls back to the first funnel when the id does not match", () => {
      const detail = generateDemoFunnels(SITE_ID, { id: "nonexistent-id" });
      expect(detail.ok).toBe(true);
      expect("funnel" in detail).toBe(true);
      if ("funnel" in detail) {
        expect(detail.funnel.id).toBeDefined();
      }
    });

    it("includes template funnels for non-demo-site-001 sites", () => {
      const result = generateDemoFunnels("other-site", {});
      expect(result.ok).toBe(true);
      if ("funnels" in result) {
        expect(result.funnels.length).toBeGreaterThanOrEqual(2);
        for (const funnel of result.funnels) {
          expect(funnel.siteId).toBe("other-site");
        }
      }
    });

    it("returns analysis steps with correct conversion math", () => {
      const detail = generateDemoFunnels(SITE_ID, { id: "demo-funnel-signup" });
      if (!("analysis" in detail)) throw new Error("expected analysis");

      const { steps, summary } = detail.analysis;
      expect(steps[0].dropOffSessions).toBe(0);
      expect(steps[0].conversionRate).toBe(1);
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i].dropOffSessions).toBeGreaterThanOrEqual(0);
        expect(steps[i].stepConversionRate).toBeLessThanOrEqual(1);
      }
      expect(summary.totalSessions).toBe(steps[0].sessions);
      expect(summary.convertedSessions).toBe(steps[steps.length - 1].sessions);
    });

    it("tracks the largest drop-off step index", () => {
      const detail = generateDemoFunnels(SITE_ID, {
        id: "demo-funnel-checkout",
      });
      if (!("analysis" in detail)) throw new Error("expected analysis");
      expect(detail.analysis.summary.largestDropOffStepIndex).not.toBeNull();
      expect(
        detail.analysis.summary.largestDropOffStepIndex!,
      ).toBeGreaterThanOrEqual(1);
    });

    it("handles empty id string (whitespace) as list request", () => {
      const result = generateDemoFunnels(SITE_ID, { id: "   " });
      expect("funnels" in result).toBe(true);
    });
  });

  describe("createDemoFunnel", () => {
    it("creates a funnel with the provided name and steps", () => {
      const result = createDemoFunnel(SITE_ID, {
        name: "Custom funnel",
        steps: [
          { type: "pageview", value: "/home" },
          { type: "event", value: "signup" },
        ],
      });
      expect(result.ok).toBe(true);
      expect(result.funnel.name).toBe("Custom funnel");
      expect(result.funnel.steps).toHaveLength(2);
      expect(result.funnel.steps[0]).toEqual({
        type: "pageview",
        value: "/home",
      });
      expect(result.funnel.steps[1]).toEqual({
        type: "event",
        value: "signup",
      });
      expect(result.funnel.id).toMatch(/^demo-funnel-custom-/);
    });

    it("defaults name to 'Untitled funnel' when missing", () => {
      const result = createDemoFunnel(SITE_ID, {
        steps: [
          { type: "pageview", value: "/a" },
          { type: "event", value: "b" },
        ],
      });
      expect(result.funnel.name).toBe("Untitled funnel");
    });

    it("falls back to default steps when fewer than 2 valid steps provided", () => {
      const result = createDemoFunnel(SITE_ID, {
        name: "Sparse",
        steps: [{ type: "pageview", value: "/only-one" }],
      });
      expect(result.funnel.steps).toHaveLength(2);
      expect(result.funnel.steps[0].value).toBe("/");
      expect(result.funnel.steps[1].value).toBe("conversion");
    });

    it("falls back to default steps when steps is not an array", () => {
      const result = createDemoFunnel(SITE_ID, { name: "Bad", steps: "nope" });
      expect(result.funnel.steps).toHaveLength(2);
    });

    it("filters out invalid step entries", () => {
      const result = createDemoFunnel(SITE_ID, {
        name: "Mixed",
        steps: [
          { type: "pageview", value: "/start" },
          null,
          { type: "invalid", value: "/x" },
          { type: "event", value: "" },
          { type: "event", value: "end" },
        ],
      });
      expect(result.funnel.steps).toHaveLength(2);
      expect(result.funnel.steps[0].value).toBe("/start");
      expect(result.funnel.steps[1].value).toBe("end");
    });

    it("truncates steps to a maximum of 12", () => {
      const steps = Array.from({ length: 15 }, (_, i) => ({
        type: "pageview" as const,
        value: `/step-${i}`,
      }));
      const result = createDemoFunnel(SITE_ID, { name: "Long", steps });
      expect(result.funnel.steps.length).toBeLessThanOrEqual(12);
    });

    it("assigns a unique incremental id", () => {
      const a = createDemoFunnel(SITE_ID, {
        name: "A",
        steps: [
          { type: "pageview", value: "/a" },
          { type: "event", value: "b" },
        ],
      });
      const b = createDemoFunnel(SITE_ID, {
        name: "B",
        steps: [
          { type: "pageview", value: "/c" },
          { type: "event", value: "d" },
        ],
      });
      expect(a.funnel.id).not.toBe(b.funnel.id);
    });

    it("handles null/undefined body gracefully", () => {
      const result = createDemoFunnel(SITE_ID, null);
      expect(result.ok).toBe(true);
      expect(result.funnel.name).toBe("Untitled funnel");
    });

    it("sets createdAt and updatedAt to current time", () => {
      const before = Math.floor(Date.now() / 1000);
      const result = createDemoFunnel(SITE_ID, {
        name: "Timestamped",
        steps: [
          { type: "pageview", value: "/a" },
          { type: "event", value: "b" },
        ],
      });
      const after = Math.floor(Date.now() / 1000) + 1;
      expect(result.funnel.createdAt).toBeGreaterThanOrEqual(before);
      expect(result.funnel.createdAt).toBeLessThanOrEqual(after);
      expect(result.funnel.updatedAt).toBe(result.funnel.createdAt);
    });
  });

  describe("deleteDemoFunnel", () => {
    it("returns ok: true when deleting an existing funnel", () => {
      const created = createDemoFunnel(SITE_ID, {
        name: "To delete",
        steps: [
          { type: "pageview", value: "/del" },
          { type: "event", value: "gone" },
        ],
      });
      const result = deleteDemoFunnel(SITE_ID, { id: created.funnel.id });
      expect(result.ok).toBe(true);
    });

    it("returns ok: true even when the funnel id does not exist", () => {
      const result = deleteDemoFunnel(SITE_ID, { id: "nonexistent" });
      expect(result.ok).toBe(true);
    });

    it("returns ok: true when siteId does not match", () => {
      const result = deleteDemoFunnel("wrong-site", {
        id: "demo-funnel-signup",
      });
      expect(result.ok).toBe(true);
    });

    it("handles missing id param", () => {
      const result = deleteDemoFunnel(SITE_ID, {});
      expect(result.ok).toBe(true);
    });
  });
});
