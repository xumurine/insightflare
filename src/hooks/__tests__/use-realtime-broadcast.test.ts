import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRealtimeBroadcast } from "@/hooks/use-realtime-broadcast";
import {
  broadcastRealtimeMessage,
  getRealtimeBroadcastCallbackCount,
} from "@/lib/realtime/broadcast-store";
import type {
  RealtimeBroadcastMessage,
  RealtimeChannelState,
} from "@/lib/realtime/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function channelState(status: RealtimeChannelState["status"]) {
  return {
    status,
    hasConnected: status === "connected",
    activeNow: 0,
    visitorsLast30m: 0,
    viewsLast30m: 0,
    snapshotActiveNow: null,
    events: [],
    points: [],
    visits: [],
  } satisfies RealtimeChannelState;
}

describe("useRealtimeBroadcast", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    expect(getRealtimeBroadcastCallbackCount()).toBe(0);
    vi.restoreAllMocks();
  });

  it("registers a broadcast callback and updates it without resubscribing", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const message: RealtimeBroadcastMessage = {
      siteId: "site-1",
      state: channelState("connected"),
    };

    function Probe({ callback }: { callback: typeof first }) {
      useRealtimeBroadcast(callback);
      return null;
    }

    act(() => {
      root.render(createElement(Probe, { callback: first }));
    });
    expect(getRealtimeBroadcastCallbackCount()).toBe(1);

    await broadcastRealtimeMessage(message);
    expect(first).toHaveBeenCalledWith(message);

    act(() => {
      root.render(createElement(Probe, { callback: second }));
    });
    expect(getRealtimeBroadcastCallbackCount()).toBe(1);

    await broadcastRealtimeMessage(message);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(message);
  });
});
