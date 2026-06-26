import { describe, expect, it } from "vitest";

import {
  jsonError,
  jsonSuccess,
  parseComplexFilters,
  parseCursorPagination,
  parseFilter,
  parseMetrics,
  parsePreset,
  parseSort,
  parseTimeRange,
  validateDimension,
} from "@/lib/edge/api-v1-helpers";

function url(path: string): URL {
  return new URL(`https://edge.test${path}`);
}

describe("api v1 helpers", () => {
  it("wraps success and error responses without ok", async () => {
    const success = await jsonSuccess(
      { value: 1 },
      {
        request: new Request("https://edge.test/api/v1"),
      },
    ).json();
    expect(success).toMatchObject({
      data: { value: 1 },
      meta: { generatedAt: expect.any(String), requestId: expect.any(String) },
    });
    expect(JSON.stringify(success)).not.toContain('"ok"');

    const failure = await jsonError(
      "validation_failed",
      "Invalid",
      400,
      { field: "from" },
      new Request("https://edge.test/api/v1"),
    ).json();
    expect(failure).toMatchObject({
      error: {
        code: "validation_failed",
        message: "Invalid",
        details: { field: "from" },
      },
      meta: { generatedAt: expect.any(String) },
    });
  });

  it("parses ISO time ranges and defaults to the previous seven days", () => {
    const parsed = parseTimeRange(
      url(
        "/api/v1/sites/s/analytics/overview?from=2026-06-01T00:00:00Z&to=2026-06-08T00:00:00Z",
      ),
      new Date("2026-06-26T12:00:00Z"),
    );
    expect(parsed).not.toBeInstanceOf(Response);
    if (!(parsed instanceof Response)) {
      expect(parsed.from).toBe("2026-06-01T00:00:00.000Z");
      expect(parsed.to).toBe("2026-06-08T00:00:00.000Z");
      expect(parsed.fromMs).toBeLessThan(parsed.toMs);
    }

    const defaulted = parseTimeRange(
      url("/api/v1/sites/s/analytics/overview"),
      new Date("2026-06-26T12:00:00Z"),
    );
    expect(defaulted).not.toBeInstanceOf(Response);
    if (!(defaulted instanceof Response)) {
      expect(defaulted.from).toBe("2026-06-19T12:00:00.000Z");
      expect(defaulted.to).toBe("2026-06-26T12:00:00.000Z");
    }
  });

  it("parses presets with timeZone and rejects conflicting time inputs", async () => {
    const preset = parsePreset(
      "last_7_days",
      "Asia/Shanghai",
      new Date("2026-06-26T12:00:00Z"),
    );
    expect(preset).toMatchObject({
      timeZone: "Asia/Shanghai",
      from: expect.any(String),
      to: expect.any(String),
    });

    const conflict = parseTimeRange(
      url(
        "/api/v1/sites/s/analytics/overview?preset=last_7_days&from=2026-06-01T00:00:00Z",
      ),
    );
    expect(conflict).toBeInstanceOf(Response);
    if (conflict instanceof Response) {
      expect(conflict.status).toBe(400);
      expect(await conflict.json()).toMatchObject({
        error: { code: "validation_failed" },
      });
    }

    const invalidZone = parseTimeRange(
      url("/api/v1/sites/s/analytics/overview?timeZone=Nope/Nowhere"),
    );
    expect(invalidZone).toBeInstanceOf(Response);
  });

  it("parses metrics, filters, sort, and cursor pagination", async () => {
    expect(parseMetrics("views,sessions,visitors")).toEqual([
      "views",
      "sessions",
      "visitors",
    ]);
    expect(parseMetrics("views,nope")).toBeInstanceOf(Response);

    expect(
      parseFilter(
        url(
          "/api/v1/sites/s/events?filter[geo.country]=US&filter[client.browser]=Chrome&filter[page.path]=/posts/hello",
        ),
      ),
    ).toEqual({
      "geo.country": "US",
      "client.browser": "Chrome",
      "page.path": "/posts/hello",
    });
    const invalidFilter = parseFilter(
      url("/api/v1/sites/s/events?filter[unknown.field]=x"),
    );
    expect(invalidFilter).toBeInstanceOf(Response);
    if (invalidFilter instanceof Response) {
      expect(await invalidFilter.json()).toMatchObject({
        error: { details: { field: "unknown.field" } },
      });
    }

    expect(parseSort("-lastSeenAt")).toEqual({
      field: "lastSeenAt",
      direction: "desc",
    });
    expect(parseSort("page.path")).toEqual({
      field: "page.path",
      direction: "asc",
    });

    expect(parseCursorPagination(url("/api/v1/sites/s/events"))).toEqual({
      limit: 100,
      cursor: null,
    });
    expect(
      parseCursorPagination(url("/api/v1/sites/s/events?limit=2000")),
    ).toEqual({ limit: 1000, cursor: null });
    expect(
      parseCursorPagination(url("/api/v1/sites/s/events?cursor=bad space")),
    ).toBeInstanceOf(Response);
  });

  it("validates dimensions and complex filters", () => {
    expect(validateDimension("geo.country")).toBe("geo.country");
    expect(validateDimension("country")).toBeInstanceOf(Response);
    expect(
      parseComplexFilters([
        { field: "page.path", op: "startsWith", value: "/posts/" },
        { field: "geo.country", op: "in", value: ["US", "JP"] },
      ]),
    ).toEqual([
      { field: "page.path", op: "startsWith", value: "/posts/" },
      { field: "geo.country", op: "in", value: ["US", "JP"] },
    ]);
    expect(
      parseComplexFilters([{ field: "page.path", op: "near", value: "x" }]),
    ).toBeInstanceOf(Response);
  });
});
