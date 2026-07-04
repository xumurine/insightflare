import { describe, expect, it, vi } from "vitest";

import {
  broadcastRealtimeMessage,
  getRealtimeBroadcastCallbackCount,
  registerRealtimeBroadcastCallback,
  unregisterRealtimeBroadcastCallback,
} from "@/lib/realtime/broadcast-store";
import type { RealtimeBroadcastMessage } from "@/lib/realtime/types";

const message = {
  siteId: "site-1",
  state: {
    status: "connected",
    hasConnected: true,
    activeNow: 1,
    visitorsLast30m: 2,
    viewsLast30m: 3,
    snapshotActiveNow: null,
    events: [],
    points: [],
    visits: [],
  },
} satisfies RealtimeBroadcastMessage;

describe("realtime broadcast callback store", () => {
  it("registers, broadcasts to, and unregisters callbacks", async () => {
    const id = Symbol("callback");
    const callback = vi.fn();

    registerRealtimeBroadcastCallback(id, callback);
    expect(getRealtimeBroadcastCallbackCount()).toBeGreaterThanOrEqual(1);

    await broadcastRealtimeMessage(message);
    expect(callback).toHaveBeenCalledWith(message);

    unregisterRealtimeBroadcastCallback(id);
    const calls = callback.mock.calls.length;
    await broadcastRealtimeMessage(message);
    expect(callback).toHaveBeenCalledTimes(calls);
  });

  it("waits for async callbacks and tolerates rejected callbacks", async () => {
    const okId = Symbol("ok");
    const badId = Symbol("bad");
    const ok = vi.fn().mockResolvedValue(undefined);
    const bad = vi.fn().mockRejectedValue(new Error("boom"));

    registerRealtimeBroadcastCallback(okId, ok);
    registerRealtimeBroadcastCallback(badId, bad);
    await expect(broadcastRealtimeMessage(message)).resolves.toBeUndefined();

    expect(ok).toHaveBeenCalledWith(message);
    expect(bad).toHaveBeenCalledWith(message);

    unregisterRealtimeBroadcastCallback(okId);
    unregisterRealtimeBroadcastCallback(badId);
  });

  it("ignores unregister requests for unknown ids", () => {
    const before = getRealtimeBroadcastCallbackCount();
    unregisterRealtimeBroadcastCallback(Symbol("missing"));
    expect(getRealtimeBroadcastCallbackCount()).toBe(before);
  });
});
