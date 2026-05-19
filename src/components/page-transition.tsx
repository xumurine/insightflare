"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  type NavigateRequest,
  registerPageTransitionHandler,
} from "@/lib/page-transition";

interface PageTransitionProps {
  children: React.ReactNode;
}

function isDashboardDetailRoute(pathname: string): boolean {
  return /\/(?:visitors|sessions)\/detail(?:\/|$)/.test(pathname);
}

function scrollPageToTop(behavior: ScrollBehavior) {
  const dashboardScrollContainer = document.querySelector<HTMLElement>(
    "[data-dashboard-scroll-container]",
  );

  if (dashboardScrollContainer) {
    dashboardScrollContainer.scrollTo({
      top: 0,
      behavior,
    });
    return;
  }

  window.scrollTo({
    top: 0,
    behavior,
  });
}

export function PageTransition({ children }: PageTransitionProps) {
  const EXIT_DURATION_MS = 280;
  const ENTER_DURATION_MS = 320;
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useRef(false);
  const exitingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<NavigateRequest | null>(null);
  const previousPathnameRef = useRef(pathname);
  const [transitionState, setTransitionState] = useState<
    "idle" | "enter" | "exit"
  >("idle");
  const routeKey = pathname;

  const performNavigation = useCallback(
    (request: NavigateRequest) => {
      if (request.replace) {
        router.replace(request.href, { scroll: request.scroll });
        return;
      }
      router.push(request.href, { scroll: request.scroll });
    },
    [router],
  );

  const startExit = useCallback(
    (request: NavigateRequest) => {
      let currentUrl: URL;
      let nextUrl: URL;
      try {
        currentUrl = new URL(window.location.href);
        nextUrl = new URL(request.href, window.location.href);
      } catch {
        performNavigation(request);
        return;
      }

      if (
        nextUrl.origin === currentUrl.origin &&
        nextUrl.pathname === currentUrl.pathname
      ) {
        performNavigation(request);
        return;
      }

      const current = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      const destination = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      if (destination === current) return;

      if (reduceMotion.current) {
        performNavigation(request);
        return;
      }

      if (exitingRef.current) return;
      exitingRef.current = true;
      pendingRef.current = request;
      setTransitionState("exit");

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        const next = pendingRef.current;
        if (!next) return;
        performNavigation(next);
      }, EXIT_DURATION_MS);
    },
    [performNavigation],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reduceMotion.current = media.matches;
    };

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const unregister = registerPageTransitionHandler((request) => {
      startExit(request);
    });

    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;

      const target = event.target as HTMLElement | null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      if (link.closest("[data-skip-page-transition]")) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      const href = link.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:")
      ) {
        return;
      }

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;

      const destination = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (destination === current) return;

      event.preventDefault();
      startExit({ href: destination });
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      unregister();
      document.removeEventListener("click", handleClick, true);
    };
  }, [startExit]);

  useEffect(() => {
    if (enterTimeoutRef.current) {
      clearTimeout(enterTimeoutRef.current);
      enterTimeoutRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const shouldEnter = exitingRef.current && !reduceMotion.current;
    exitingRef.current = false;
    pendingRef.current = null;
    if (shouldEnter) {
      setTransitionState("enter");
      enterTimeoutRef.current = setTimeout(() => {
        setTransitionState("idle");
        enterTimeoutRef.current = null;
      }, ENTER_DURATION_MS);
      return;
    }

    setTransitionState("idle");
  }, [routeKey]);

  useEffect(() => {
    return () => {
      if (enterTimeoutRef.current) {
        clearTimeout(enterTimeoutRef.current);
        enterTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;
    if (
      isDashboardDetailRoute(previousPathname) ||
      isDashboardDetailRoute(pathname)
    ) {
      return;
    }

    scrollPageToTop(reduceMotion.current ? "auto" : "smooth");
  }, [pathname]);

  return (
    <div data-page-transition data-transition={transitionState}>
      {children}
    </div>
  );
}
