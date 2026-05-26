import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  compactClientForLog,
  errorToMessage,
  logDoTrace,
  toUnixSeconds,
} from "@/lib/edge/ingest-log";

const NOW = Date.UTC(2026, 4, 25, 12, 0, 0);

describe("edge ingest log helpers branch coverage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clamps unix seconds at zero and floors positive timestamps", () => {
    expect(toUnixSeconds(-1)).toBe(0);
    expect(toUnixSeconds(0)).toBe(0);
    expect(toUnixSeconds(1_999)).toBe(1);
  });

  it("normalizes thrown values into log messages", () => {
    expect(errorToMessage(new Error("boom"))).toBe("boom");
    expect(errorToMessage("plain")).toBe("plain");
    expect(errorToMessage(null)).toBe("null");
  });

  it("routes trace logs by level with structured payloads", () => {
    logDoTrace("info_event", { siteId: "site-1" });
    logDoTrace("warn_event", { count: 2 }, "warn");
    logDoTrace("error_event", { ok: false }, "error");

    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);

    expect(JSON.parse(vi.mocked(console.log).mock.calls[0]![0])).toEqual({
      event: "info_event",
      at: "2026-05-25T12:00:00.000Z",
      siteId: "site-1",
    });
    expect(JSON.parse(vi.mocked(console.warn).mock.calls[0]![0])).toEqual({
      event: "warn_event",
      at: "2026-05-25T12:00:00.000Z",
      count: 2,
    });
    expect(JSON.parse(vi.mocked(console.error).mock.calls[0]![0])).toEqual({
      event: "error_event",
      at: "2026-05-25T12:00:00.000Z",
      ok: false,
    });
  });

  it("compacts tracker clients with defaults and preserves explicit timestamps", () => {
    expect(compactClientForLog(undefined)).toEqual({});
    expect(compactClientForLog({})).toEqual({
      kind: "",
      siteId: "",
      visitId: "",
      sessionId: "",
      eventId: "",
      eventName: "",
      pathname: "",
      hostname: "",
      timestamp: null,
    });
    expect(
      compactClientForLog({
        kind: "custom_event",
        siteId: "site-1",
        visitId: "visit-1",
        sessionId: "session-1",
        eventId: "event-1",
        eventName: "Signup",
        pathname: "/pricing",
        hostname: "example.test",
        timestamp: 0,
      }),
    ).toEqual({
      kind: "custom_event",
      siteId: "site-1",
      visitId: "visit-1",
      sessionId: "session-1",
      eventId: "event-1",
      eventName: "Signup",
      pathname: "/pricing",
      hostname: "example.test",
      timestamp: 0,
    });
  });
});
