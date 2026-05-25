import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  pushUrlWithoutNavigation,
  replaceUrlWithoutNavigation,
} from "@/lib/client-history";

describe("client history URL helpers", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/start?tab=one#top");
    vi.restoreAllMocks();
  });

  it("replaces the current URL without navigating and dispatches a URL state change event", () => {
    const listener = vi.fn();
    window.addEventListener("insightflare:url-state-change", listener);

    replaceUrlWithoutNavigation("/next?tab=two#section");

    expect(window.location.pathname).toBe("/next");
    expect(window.location.search).toBe("?tab=two");
    expect(window.location.hash).toBe("#section");
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("insightflare:url-state-change", listener);
  });

  it("pushes the current URL without navigating and dispatches a URL state change event", () => {
    const listener = vi.fn();
    window.addEventListener("insightflare:url-state-change", listener);

    pushUrlWithoutNavigation("relative/path?q=1");

    expect(window.location.pathname).toBe("/relative/path");
    expect(window.location.search).toBe("?q=1");
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("insightflare:url-state-change", listener);
  });

  it("does not dispatch when the target URL matches the current location", () => {
    const listener = vi.fn();
    window.addEventListener("insightflare:url-state-change", listener);

    replaceUrlWithoutNavigation("/start?tab=one#top");
    pushUrlWithoutNavigation("/start?tab=one#top");

    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener("insightflare:url-state-change", listener);
  });
});
