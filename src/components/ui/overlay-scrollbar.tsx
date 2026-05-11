"use client";

import { type ComponentPropsWithoutRef, useEffect, useRef } from "react";
import type { PartialOptions } from "overlayscrollbars";
import { OverlayScrollbars } from "overlayscrollbars";

import { cn } from "@/lib/utils";

export const HORIZONTAL_SCROLLBAR_OPTIONS = {
  overflow: {
    x: "scroll",
    y: "hidden",
  },
  scrollbars: {
    theme: "os-theme-insightflare",
    autoHide: "move",
    autoHideDelay: 420,
    autoHideSuspend: false,
  },
} satisfies PartialOptions;

interface OverlayScrollbarProps extends ComponentPropsWithoutRef<"div"> {
  options?: PartialOptions;
  syncKey?: string | number | boolean | null;
}

export function OverlayScrollbar({
  children,
  className,
  options = HORIZONTAL_SCROLLBAR_OPTIONS,
  syncKey,
  ...props
}: OverlayScrollbarProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const syncSlotBoundsRef = useRef<(() => void) | null>(null);
  const scrollbarRef = useRef<ReturnType<typeof OverlayScrollbars> | null>(
    null,
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const slot = document.createElement("div");
    slot.style.position = "fixed";
    slot.style.bottom = "0";
    slot.style.left = "0";
    slot.style.width = "0";
    slot.style.height = "12px";
    slot.style.zIndex = "99999";
    document.body.appendChild(slot);

    const existing = OverlayScrollbars(host);
    const instance =
      existing ??
      OverlayScrollbars(
        {
          target: host,
          scrollbars: {
            slot,
          },
        },
        options,
      );
    if (existing) {
      existing.options(options);
    }
    scrollbarRef.current = instance;

    const syncSlotBounds = () => {
      const rect = host.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const right = Math.min(window.innerWidth, rect.right);
      const width = Math.max(0, right - left);
      const isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
      const hasHorizontalOverflow = instance.state().hasOverflow.x;
      const slotHeight = slot.offsetHeight || 12;
      const isAtHostBottom = rect.bottom <= window.innerHeight;

      slot.style.display = isVisible && hasHorizontalOverflow ? "" : "none";
      slot.style.width = `${width}px`;
      if (isAtHostBottom) {
        slot.style.position = "absolute";
        slot.style.bottom = "";
        slot.style.top = `${window.scrollY + rect.bottom - slotHeight}px`;
        slot.style.left = `${window.scrollX + left}px`;
      } else {
        slot.style.position = "fixed";
        slot.style.top = "";
        slot.style.bottom = "0";
        slot.style.left = `${left}px`;
      }
    };

    syncSlotBoundsRef.current = syncSlotBounds;
    const resizeObserver = new ResizeObserver(syncSlotBounds);

    resizeObserver.observe(host);
    window.addEventListener("resize", syncSlotBounds);
    window.addEventListener("scroll", syncSlotBounds, true);
    instance.update(true);
    syncSlotBounds();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncSlotBounds);
      window.removeEventListener("scroll", syncSlotBounds, true);
      if (!existing) {
        instance.destroy();
      }
      if (scrollbarRef.current === instance) {
        scrollbarRef.current = null;
      }
      if (syncSlotBoundsRef.current === syncSlotBounds) {
        syncSlotBoundsRef.current = null;
      }
      slot.remove();
    };
  }, [options]);

  useEffect(() => {
    scrollbarRef.current?.update(true);
    syncSlotBoundsRef.current?.();
  });

  useEffect(() => {
    scrollbarRef.current?.update(true);
    syncSlotBoundsRef.current?.();
  }, [syncKey]);

  return (
    <div
      {...props}
      ref={hostRef}
      className={cn("overflow-hidden", className)}
      data-overlayscrollbars-initialize
    >
      {children}
    </div>
  );
}
