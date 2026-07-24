import { useEffect } from "react";
import type { PartialOptions } from "overlayscrollbars";
import { OverlayScrollbars } from "overlayscrollbars";

import {
  prepareNativeScrollbarHost,
  shouldUseNativeScrollbars,
} from "@/components/ui/overlay-scrollbar";

const globalScrollbarOptions = {
  overflow: {
    x: "hidden",
    y: "scroll",
  },
  scrollbars: {
    theme: "os-theme-insightflare",
    autoHide: "move",
    autoHideDelay: 420,
    autoHideSuspend: false,
  },
} satisfies PartialOptions;

export function GlobalScrollbars() {
  useEffect(() => {
    if (shouldUseNativeScrollbars()) {
      prepareNativeScrollbarHost(document.documentElement);
      prepareNativeScrollbarHost(document.body);
      document.documentElement.dataset.nativeScrollbars = "true";
      return () => {
        delete document.documentElement.dataset.nativeScrollbars;
      };
    }

    const existingInstance = OverlayScrollbars(document.body);
    const instance =
      existingInstance ??
      OverlayScrollbars(document.body, globalScrollbarOptions);

    if (existingInstance) {
      existingInstance.options(globalScrollbarOptions);
    }

    return () => {
      if (!existingInstance) {
        instance.destroy();
      }
    };
  }, []);

  return null;
}
