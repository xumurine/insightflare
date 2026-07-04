import { describe, expect, it } from "vitest";

import {
  asJsonRecord,
  safeJsonStringify,
  safeParseRecord,
} from "@/lib/notifications/json";

describe("notification json helpers", () => {
  it("stringifies invalid values safely", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(safeJsonStringify(null)).toBe("{}");
    expect(safeJsonStringify({ ok: true })).toBe('{"ok":true}');
    expect(safeJsonStringify(circular)).toBe("{}");
  });

  it("parses only object records", () => {
    expect(safeParseRecord({ ok: true })).toEqual({ ok: true });
    expect(safeParseRecord("[1,2]")).toEqual({});
    expect(safeParseRecord("bad")).toEqual({});
    expect(safeParseRecord(null)).toEqual({});
    expect(safeParseRecord('{"ok":true}')).toEqual({ ok: true });
  });

  it("clones JSON-compatible records and drops unsupported values", () => {
    expect(
      asJsonRecord({
        text: "x",
        count: 1,
        enabled: true,
        none: null,
        list: [1, "x"],
        nested: { a: 1 },
        fn: () => undefined,
        missing: undefined,
      }),
    ).toEqual({
      text: "x",
      count: 1,
      enabled: true,
      none: null,
      list: [1, "x"],
      nested: { a: 1 },
    });
    expect(asJsonRecord("bad")).toEqual({});
  });
});
