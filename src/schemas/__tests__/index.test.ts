import { describe, expect, it } from "vitest";

import { getAllRegisteredSchemas } from "@/schemas/common";

describe("schema index barrel export", () => {
  it("imports all schema modules without errors", async () => {
    const mod = await import("@/schemas/index");
    expect(mod).toBeDefined();
    expect(typeof mod).toBe("object");
  });

  it("registers schemas from all modules", () => {
    const all = getAllRegisteredSchemas();
    const names = all.map((s) => s.name);

    // common
    expect(names).toContain("Envelope");
    expect(names).toContain("ErrorEnvelope");
    expect(names).toContain("PaginationMeta");

    // site
    expect(names).toContain("Site");
    expect(names).toContain("SiteCreateInput");
    expect(names).toContain("SiteUpdateInput");

    // site-config
    expect(names).toContain("SiteConfig");
    expect(names).toContain("SiteConfigUpdateInput");
    expect(names).toContain("ScriptSnippet");

    // analytics
    expect(names).toContain("Interval");
    expect(names).toContain("QueryName");
    expect(names).toContain("OverviewData");
    expect(names).toContain("OverviewResponse");
    expect(names).toContain("BatchInput");
    expect(names).toContain("BatchResponse");

    // funnel
    expect(names).toContain("FunnelStep");
    expect(names).toContain("FunnelDefinition");
    expect(names).toContain("FunnelCreateInput");

    // realtime
    expect(names).toContain("RealtimeEvent");
    expect(names).toContain("ActiveVisitors");
    expect(names).toContain("RealtimeSnapshotData");

    // team
    expect(names).toContain("TeamDashboardSite");
    expect(names).toContain("TeamDashboardData");

    // tracker
    expect(names).toContain("TrackerClientPayload");
  });
});
