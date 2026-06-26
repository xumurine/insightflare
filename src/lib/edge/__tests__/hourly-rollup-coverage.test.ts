import { describe, expect, it } from "vitest";

import {
  hasDashboardFilters,
  ROLLUP_LAG_HOURS,
  ROLLUP_SCHEMA_VERSION,
} from "@/lib/edge/hourly-rollup";

describe("hourly-rollup constants", () => {
  it("exports expected constants", () => {
    expect(ROLLUP_LAG_HOURS).toBe(12);
    expect(ROLLUP_SCHEMA_VERSION).toBe(1);
  });
});

describe("hasDashboardFilters", () => {
  it("returns true when an array filter is non-empty", () => {
    expect(hasDashboardFilters({ country: ["US"] } as never)).toBe(true);
  });

  it("returns false when an array filter is empty", () => {
    expect(hasDashboardFilters({ country: [] } as never)).toBe(false);
  });

  it("returns true for numeric filter values", () => {
    expect(hasDashboardFilters({ limit: 10 } as never)).toBe(true);
  });

  it("returns true for zero value (non-empty filter)", () => {
    expect(hasDashboardFilters({ limit: 0 } as never)).toBe(true);
  });
});
