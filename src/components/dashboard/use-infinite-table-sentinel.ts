import { useEffect, useState } from "react";

interface UseInfiniteTableSentinelOptions {
  enabled: boolean;
  onReachEnd: () => void;
  rootMargin?: string;
}

export function useInfiniteTableSentinel({
  enabled,
  onReachEnd,
  rootMargin = "360px 0px",
}: UseInfiniteTableSentinelOptions) {
  const [sentinelNode, setSentinelNode] = useState<HTMLTableRowElement | null>(
    null,
  );

  useEffect(() => {
    if (
      !sentinelNode ||
      !enabled ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onReachEnd();
      },
      { root: null, rootMargin, threshold: 0.01 },
    );
    observer.observe(sentinelNode);
    const frameId = window.requestAnimationFrame(() => {
      const rect = sentinelNode.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 480 && rect.bottom >= -480) {
        onReachEnd();
      }
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [enabled, onReachEnd, rootMargin, sentinelNode]);

  return setSentinelNode;
}
