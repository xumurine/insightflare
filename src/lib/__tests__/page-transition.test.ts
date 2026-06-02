import { describe, expect, it, vi } from "vitest";

import {
  navigateWithTransition,
  registerPageTransitionHandler,
} from "@/lib/page-transition";

describe("page transition navigation", () => {
  function router() {
    return {
      push: vi.fn(),
      replace: vi.fn(),
    };
  }

  it("delegates navigation to the registered transition handler", () => {
    const handler = vi.fn();
    const unregister = registerPageTransitionHandler(handler);
    const mockRouter = router();

    navigateWithTransition(mockRouter, "/target", {
      replace: true,
      scroll: false,
    });

    expect(handler).toHaveBeenCalledWith({
      href: "/target",
      replace: true,
      scroll: false,
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    unregister();
  });

  it("falls back to router push or replace when no handler is registered", () => {
    const staleHandler = vi.fn();
    const unregister = registerPageTransitionHandler(staleHandler);
    unregister();

    const mockRouter = router();
    navigateWithTransition(mockRouter, "/push", { scroll: true });
    navigateWithTransition(mockRouter, "/replace", {
      replace: true,
      scroll: false,
    });

    expect(mockRouter.push).toHaveBeenCalledWith("/push", { scroll: true });
    expect(mockRouter.replace).toHaveBeenCalledWith("/replace", {
      scroll: false,
    });
    expect(staleHandler).not.toHaveBeenCalled();
  });

  it("does not unregister a newer handler from an older cleanup callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registerPageTransitionHandler(first);
    registerPageTransitionHandler(second);

    unregisterFirst();
    navigateWithTransition(router(), "/target");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({
      href: "/target",
      replace: undefined,
      scroll: undefined,
    });

    registerPageTransitionHandler(() => undefined)();
  });
});
