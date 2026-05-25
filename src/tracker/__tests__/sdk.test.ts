import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Tracker Browser SDK Integration Suite", () => {
  let mockScriptEl: HTMLScriptElement;
  let originalFetch: any;

  beforeEach(() => {
    // Reset browser storage and global states to isolate installations
    delete (window as any).__insightflare_tracker_v6__;
    window.localStorage.clear();
    window.sessionStorage.clear();

    // Mock global fetch to return resolved promise instantly and prevent pending queries during teardown
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ ok: true }))),
      ) as any;

    // Mock document.currentScript, which is required as an entry guard by the SDK script
    mockScriptEl = document.createElement("script");
    mockScriptEl.src = "https://analytics.example.com/script.js";
    Object.defineProperty(document, "currentScript", {
      value: mockScriptEl,
      writable: true,
      configurable: true,
    });

    // Provide default crypto mock if randomUUID is missing in JSDOM environment
    if (!globalThis.crypto) {
      (globalThis as any).crypto = {};
    }
    if (!globalThis.crypto.randomUUID) {
      globalThis.crypto.randomUUID = () =>
        "mocked-uuid-1111-2222-3333-44445555";
    }

    (globalThis as any).BUILD_PERFORMANCE = true;

    vi.resetModules();
  });

  afterEach(() => {
    // Restore global fetch
    globalThis.fetch = originalFetch;

    // Cleanup script guard
    Object.defineProperty(document, "currentScript", {
      value: null,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("should successfully boot the SDK and mount the installation flag when loaded properly", async () => {
    // Import dynamically using stable clean paths since vi.resetModules() already clears memory cache
    await import("../sdk.ts");

    // The SDK registers an install key in window containing the exported public APIs object
    expect((window as any).__insightflare_tracker_v6__).toBeDefined();
    expect((window as any).__insightflare_tracker_v6__).toBeTypeOf("object");
    expect((window as any).__insightflare_tracker_v6__.track).toBeTypeOf(
      "function",
    );
  });

  it("should throw an entry error if loaded without a valid currentScript", async () => {
    // Strip script mock
    Object.defineProperty(document, "currentScript", {
      value: null,
      writable: true,
      configurable: true,
    });

    // Asset the loader crashes safely during bootstrap, preventing invalid script mounts
    await expect(import("../sdk.ts")).rejects.toThrow(
      "InsightFlare: script element not found",
    );
  });

  it("should gracefully proceed without error under default unreplaced DNT placeholder when DNT is active", async () => {
    // Enable navigator DNT flag
    Object.defineProperty(navigator, "doNotTrack", {
      value: "1",
      writable: true,
      configurable: true,
    });

    // Asset the bootstrap does NOT reject because IGNORE_DO_NOT_TRACK placeholder is a non-empty string truthy value
    const sdk = await import("../sdk.ts");
    expect(sdk).toBeDefined();

    // Restore DNT
    Object.defineProperty(navigator, "doNotTrack", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("should fall back to standard POST fetch when sendBeacon is unsupported", async () => {
    // Strip sendBeacon capability from mock browser navigator
    const originalSendBeacon = navigator.sendBeacon;
    (navigator as any).sendBeacon = undefined;

    // Spy on global fetch API
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ ok: true }))),
      );

    // Boot SDK
    await import("../sdk.ts");

    // Since sendBeacon is missing, the SDK pageview track must fall back to standard fetch
    expect(fetchSpy).toHaveBeenCalled();
    const [calledUrl, calledOptions] = fetchSpy.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledUrl).toContain("/collect");
    expect(calledOptions.method).toBe("POST");
    expect(calledOptions.headers).toEqual({
      "content-type": "application/json",
    });

    // Restore
    if (originalSendBeacon) {
      navigator.sendBeacon = originalSendBeacon;
    }
  });
});
