import { describe, expect, it } from "vitest";

import { generateDemoRequestObservationData } from "@/lib/realtime/mock/request-observation";

describe("mock/request-observation", () => {
  it("generates populated request observation demo data", () => {
    const data = generateDemoRequestObservationData(1440);

    expect(data.ok).toBe(true);
    expect(data.configured).toBe(true);
    expect(data.summary.total).toBeGreaterThan(0);
    expect(data.summary.baselineRequests).toBeGreaterThan(data.summary.total);
    expect(data.summary.botRequestRatio).toBeGreaterThan(0);
    expect(data.summary.botRequestRatio).toBeLessThan(1);
    expect(data.summary.highConfidence).toBeGreaterThan(0);
    expect(data.summary.mediumConfidence).toBeGreaterThan(0);
    expect(data.summary.affectedSites).toBeGreaterThan(0);
    expect(data.summary.uniqueAsns).toBeGreaterThan(0);
    expect(data.summary.uniqueCountries).toBeGreaterThan(0);
    expect(data.events.length).toBe(data.summary.total);
    expect(data.trend.length).toBeGreaterThan(0);
    expect(data.reasons.length).toBeGreaterThan(0);
    expect(data.asns.length).toBeGreaterThan(0);
    expect(data.mapPoints.length).toBeGreaterThan(0);
  });
});
