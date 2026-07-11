import { type ReactNode, useEffect, useRef } from "react";

import {
  AutoTransition,
  type AutoTransitionProps,
} from "@/components/ui/auto-transition";
import { cn } from "@/lib/utils";

type SidebarMenuMode = "root" | "team" | "site";

const SIDEBAR_MODE_STORAGE_KEY = "insightflare-sidebar-mode";
const MODE_ORDER: Record<SidebarMenuMode, number> = {
  root: 0,
  team: 1,
  site: 2,
};

function isSidebarMenuMode(value: string | null): value is SidebarMenuMode {
  return value === "root" || value === "team" || value === "site";
}

interface SidebarMenuStageProps {
  mode: SidebarMenuMode;
  children: ReactNode;
  className?: string;
  storageKey?: string;
}

export function SidebarMenuStage({
  mode,
  children,
  className,
  storageKey = SIDEBAR_MODE_STORAGE_KEY,
}: SidebarMenuStageProps) {
  const previousModeRef = useRef<SidebarMenuMode | null>(null);
  const directionRef = useRef<1 | -1>(1);
  const animateInitialRef = useRef(false);

  if (previousModeRef.current === null) {
    previousModeRef.current = mode;
    if (storageKey && typeof window !== "undefined") {
      const storedMode = window.sessionStorage.getItem(storageKey);
      if (isSidebarMenuMode(storedMode) && storedMode !== mode) {
        directionRef.current =
          MODE_ORDER[storedMode] < MODE_ORDER[mode] ? 1 : -1;
        animateInitialRef.current = true;
      }
    }
  }

  if (previousModeRef.current !== mode) {
    directionRef.current =
      MODE_ORDER[previousModeRef.current] < MODE_ORDER[mode] ? 1 : -1;
    previousModeRef.current = mode;
  }

  useEffect(() => {
    if (!storageKey) return;
    window.sessionStorage.setItem(storageKey, mode);
  }, [mode, storageKey]);

  const variants: NonNullable<AutoTransitionProps["customVariants"]> = {
    initial: (direction) => ({
      opacity: 0,
      x: Number(direction) * 20,
    }),
    animate: {
      opacity: 1,
      x: 0,
    },
    exit: (direction) => ({
      opacity: 0,
      x: -Number(direction) * 20,
    }),
  };

  return (
    <div className={cn("relative grid overflow-hidden", className)}>
      <AutoTransition
        type="slide"
        duration={0.2}
        initial={animateInitialRef.current}
        custom={directionRef.current}
        presenceMode="sync"
        customVariants={variants}
        className="[grid-area:1/1] w-full will-change-transform"
      >
        <div key={mode}>{children}</div>
      </AutoTransition>
    </div>
  );
}
