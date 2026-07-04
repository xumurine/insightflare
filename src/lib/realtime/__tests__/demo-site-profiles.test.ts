import { describe, expect, it } from "vitest";

import {
  DEMO_SITE_PROFILES,
  findSiteProfile,
} from "@/lib/realtime/demo-site-profiles";

describe("demo site profiles", () => {
  it("returns the requested profile by id", () => {
    const profile = DEMO_SITE_PROFILES[1] ?? DEMO_SITE_PROFILES[0];

    expect(findSiteProfile(profile.id)).toBe(profile);
  });

  it("falls back to the first profile for unknown ids", () => {
    expect(findSiteProfile("missing-site")).toBe(DEMO_SITE_PROFILES[0]);
  });
});
