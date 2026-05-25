import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  pushUrlWithoutNavigation,
  replaceUrlWithoutNavigation,
  useLiveSearchParams,
} from "@/lib/client-history";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("client history URL helpers", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    window.history.replaceState(null, "", "/start?tab=one#top");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
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

  it("keeps useLiveSearchParams synced with history helper changes and popstate", () => {
    function Probe() {
      const params = useLiveSearchParams();
      return createElement(
        "span",
        null,
        `${params.get("tab") || ""}:${params.get("page") || ""}`,
      );
    }

    act(() => {
      root.render(createElement(Probe));
    });

    expect(container.textContent).toBe("one:");

    act(() => {
      pushUrlWithoutNavigation("/start?tab=two&page=3#top");
    });

    expect(container.textContent).toBe("two:3");

    act(() => {
      window.history.replaceState(null, "", "/start?tab=three");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(container.textContent).toBe("three:");
  });
});
