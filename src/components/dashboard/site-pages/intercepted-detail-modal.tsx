"use client";

import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";

const EXIT_DURATION_MS = 360;
const CLOSE_MAX_BACK_STEPS = 24;
const CLOSE_BACK_GUARD_TIMEOUT_MS = 1600;
const CLOSE_SCROLL_TOP_THRESHOLD = 2;
const CLOSE_SCROLL_MAX_WAIT_MS = 900;

const InterceptedDetailModalCloseContext = createContext<(() => void) | null>(
  null,
);

interface InterceptedDetailModalProps {
  ariaLabel: string;
  children: ReactNode;
}

interface ContentAreaBounds {
  left: number;
  width: number;
}

export function useInterceptedDetailModalClose() {
  return useContext(InterceptedDetailModalCloseContext);
}

export function InterceptedDetailModal({
  ariaLabel,
  children,
}: InterceptedDetailModalProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);
  const [contentAreaBounds, setContentAreaBounds] =
    useState<ContentAreaBounds | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closeAnimationFrameRef = useRef<number | null>(null);
  const closeScrollFrameRef = useRef<number | null>(null);
  const closeScrollTimeoutRef = useRef<number | null>(null);
  const isPreparingCloseRef = useRef(false);

  const clearCloseScrollPending = useCallback(() => {
    if (closeScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(closeScrollFrameRef.current);
      closeScrollFrameRef.current = null;
    }
    if (closeScrollTimeoutRef.current !== null) {
      window.clearTimeout(closeScrollTimeoutRef.current);
      closeScrollTimeoutRef.current = null;
    }
  }, []);

  const clearCloseAnimationPending = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (closeAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(closeAnimationFrameRef.current);
      closeAnimationFrameRef.current = null;
    }
  }, []);

  const triggerCloseAnimation = useCallback(() => {
    if (closeAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(closeAnimationFrameRef.current);
      closeAnimationFrameRef.current = null;
    }

    closeAnimationFrameRef.current = window.requestAnimationFrame(() => {
      closeAnimationFrameRef.current = null;
      setIsClosing(true);
    });
  }, []);

  const backUntilPathnameChanged = useCallback(() => {
    if (typeof window === "undefined") {
      router.back();
      return;
    }

    const startPath = `${window.location.pathname}${window.location.search}`;
    let backSteps = 0;
    let guardTimer: number | null = null;

    function cleanup() {
      window.removeEventListener("popstate", handlePopState);
      if (guardTimer !== null) {
        window.clearTimeout(guardTimer);
        guardTimer = null;
      }
    }

    function stepBack() {
      const currentPath = `${window.location.pathname}${window.location.search}`;

      if (currentPath !== startPath) {
        cleanup();
        return;
      }

      if (backSteps >= CLOSE_MAX_BACK_STEPS) {
        cleanup();
        router.back();
        return;
      }

      backSteps += 1;
      window.history.back();
    }

    function handlePopState() {
      stepBack();
    }

    window.addEventListener("popstate", handlePopState);
    guardTimer = window.setTimeout(() => {
      cleanup();
      router.back();
    }, CLOSE_BACK_GUARD_TIMEOUT_MS);
    stepBack();
  }, [router]);

  const handleClose = useCallback(() => {
    if (isClosing || isPreparingCloseRef.current) return;
    isPreparingCloseRef.current = true;
    const scrollContainer = scrollContainerRef.current;

    const getScrollTop = () => {
      if (scrollContainer) return scrollContainer.scrollTop;
      return window.scrollY || document.documentElement.scrollTop || 0;
    };

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearCloseScrollPending();
      triggerCloseAnimation();
    };

    const currentTop = getScrollTop();
    if (currentTop <= CLOSE_SCROLL_TOP_THRESHOLD) {
      finish();
      return;
    }

    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    const checkReachedTop = () => {
      if (getScrollTop() <= CLOSE_SCROLL_TOP_THRESHOLD) {
        finish();
        return;
      }
      closeScrollFrameRef.current =
        window.requestAnimationFrame(checkReachedTop);
    };

    closeScrollFrameRef.current = window.requestAnimationFrame(checkReachedTop);
    closeScrollTimeoutRef.current = window.setTimeout(() => {
      finish();
    }, CLOSE_SCROLL_MAX_WAIT_MS);
  }, [clearCloseScrollPending, isClosing, triggerCloseAnimation]);

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(
      '[data-slot="sidebar-inset"]',
    );
    if (!target) return;

    let animationFrame: number | null = null;

    const updateBounds = () => {
      const rect = target.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const nextBounds = {
        left,
        width: Math.max(0, Math.min(rect.width, window.innerWidth - left)),
      };

      setContentAreaBounds((current) => {
        if (
          current &&
          Math.abs(current.left - nextBounds.left) < 0.5 &&
          Math.abs(current.width - nextBounds.width) < 0.5
        ) {
          return current;
        }

        return nextBounds;
      });
    };

    const scheduleUpdate = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        updateBounds();
      });
    };

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(target);
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [handleClose]);

  useEffect(() => {
    setIsClosing(false);
    isPreparingCloseRef.current = false;
    clearCloseScrollPending();
    clearCloseAnimationPending();
  }, [clearCloseAnimationPending, clearCloseScrollPending, pathname]);

  useEffect(() => {
    if (!isClosing) return;

    closeTimerRef.current = window.setTimeout(() => {
      backUntilPathnameChanged();
    }, EXIT_DURATION_MS);

    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [backUntilPathnameChanged, isClosing]);

  useEffect(() => {
    return () => {
      isPreparingCloseRef.current = false;
      clearCloseScrollPending();
      clearCloseAnimationPending();
    };
  }, [clearCloseAnimationPending, clearCloseScrollPending]);

  const contentAreaStyle = contentAreaBounds
    ? ({
        left: contentAreaBounds.left,
        width: contentAreaBounds.width,
      } as CSSProperties)
    : undefined;

  return (
    <InterceptedDetailModalCloseContext.Provider value={handleClose}>
      <div
        ref={scrollContainerRef}
        className="fixed inset-y-0 left-0 z-[96] w-full overflow-y-auto overscroll-contain"
        style={contentAreaStyle}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isClosing ? 0 : 1 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={handleClose}
        />

        <div className="pointer-events-none relative mx-auto flex max-w-[1400px] items-start gap-6 px-2 pb-[4em] pt-[8em] md:px-4">
          <motion.div
            initial={{
              y: "112vh",
              rotate: -0.8,
            }}
            animate={
              isClosing ? { y: "112vh", rotate: 0.4 } : { y: "0vh", rotate: 0 }
            }
            transition={
              isClosing
                ? { duration: 0.36, ease: [0.38, 0.05, 0.86, 0.28] }
                : {
                    type: "spring",
                    stiffness: 170,
                    damping: 24,
                    mass: 0.92,
                  }
            }
            className="pointer-events-auto relative min-h-[132vh] min-w-0 flex-1 overflow-hidden rounded-sm border border-border/80 bg-background shadow-[0_-24px_70px_rgba(0,0,0,0.35)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
          >
            <div className="relative h-full">{children}</div>
          </motion.div>
        </div>
      </div>
    </InterceptedDetailModalCloseContext.Provider>
  );
}
