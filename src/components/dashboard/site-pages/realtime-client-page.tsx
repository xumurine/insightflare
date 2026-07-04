"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import NumberFlow, { continuous } from "@number-flow/react";

import { RealtimeLogStreamCard } from "@/components/dashboard/realtime-log-stream-card";
import {
  RealtimeStatusDot,
  realtimeStatusText,
} from "@/components/dashboard/realtime-status-indicator";
import { RealtimeTrafficTrendCard } from "@/components/dashboard/realtime-traffic-trend-card";
import type { RealtimeMapStageProps } from "@/components/dashboard/site-pages/realtime-map-stage";
import {
  parseRealtimeCardFilters,
  RealtimeSummaryCardsSection,
} from "@/components/dashboard/site-pages/realtime-summary-cards-section";
import { AutoTransition } from "@/components/ui/auto-transition";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import { useLiveSearchParams } from "@/lib/client-history";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface RealtimeClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  siteDomain: string;
}

type EffectiveMapTheme = "light" | "dark";

const NUMBER_FLOW_BASELINE_STYLE = {
  lineHeight: 1,
  "--number-flow-mask-height": "0px",
  "--number-flow-mask-width": "0px",
} as const;
const CONTINUOUS_NUMBER_FLOW_PLUGINS = [continuous];
const RealtimeMapStage = dynamic<RealtimeMapStageProps>(
  () =>
    import("@/components/dashboard/site-pages/realtime-map-stage").then(
      (module) => module.RealtimeMapStage,
    ),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-muted/20" />,
  },
);

export function RealtimeClientPage({
  locale,
  messages,
  siteId,
  siteDomain,
}: RealtimeClientPageProps) {
  const searchParams = useLiveSearchParams();
  const realtime = useRealtimeChannel(siteId, {
    enabled: Boolean(siteId),
  });
  const { resolvedTheme } = useTheme();
  const searchParamsKey = searchParams.toString();

  const effectiveTheme: EffectiveMapTheme =
    resolvedTheme === "dark" ? "dark" : "light";
  const requestFilters = useMemo(
    () => parseRealtimeCardFilters(new URLSearchParams(searchParamsKey)),
    [searchParamsKey],
  );
  const [enableRollingNumber, setEnableRollingNumber] = useState(false);

  useEffect(() => {
    if (!realtime.hasConnected) {
      setEnableRollingNumber(false);
      return;
    }

    const frame = requestAnimationFrame(() => {
      setEnableRollingNumber(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [realtime.hasConnected]);

  const showRealtimeMetrics = realtime.hasConnected;
  const statusLabel = realtimeStatusText(messages, realtime.status);

  return (
    <div className="space-y-6 pb-6">
      <div className="relative h-[min(72svh,calc(100svh-10.5rem))] min-h-[18rem] sm:min-h-[22rem] overflow-hidden">
        <RealtimeMapStage
          siteId={siteId}
          theme={effectiveTheme}
          points={realtime.points}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-background via-background/65 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background via-background/60 to-transparent" />

        <div className="pointer-events-none absolute left-4 top-4 z-10 md:left-6 md:top-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {messages.realtime.title}
            </h1>
            <p className="text-sm text-foreground/75">
              {messages.realtime.subtitle}
            </p>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-10 inline-flex w-auto max-w-[calc(100vw-2rem)] md:left-6 md:max-w-[calc(100vw-3rem)]">
          <div className="w-auto max-w-full">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {messages.realtime.liveMetrics}
              </p>
              <div className="min-w-0">
                <AutoTransition
                  type="fade"
                  duration={0.16}
                  initial={false}
                  presenceMode="wait"
                  className="inline-flex max-w-full items-end"
                >
                  {showRealtimeMetrics ? (
                    <div
                      key="realtime-metrics-value"
                      className="inline-flex max-w-full items-end gap-2 font-semibold text-foreground"
                    >
                      <NumberFlow
                        value={realtime.activeNow}
                        plugins={
                          enableRollingNumber
                            ? CONTINUOUS_NUMBER_FLOW_PLUGINS
                            : undefined
                        }
                        className="font-mono text-3xl leading-none tabular-nums md:text-4xl"
                        style={NUMBER_FLOW_BASELINE_STYLE}
                      />
                      <span className="pb-0.5 font-mono text-xl leading-none text-muted-foreground/70 md:text-2xl">
                        /
                      </span>
                      <NumberFlow
                        value={realtime.visitorsLast30m}
                        plugins={
                          enableRollingNumber
                            ? CONTINUOUS_NUMBER_FLOW_PLUGINS
                            : undefined
                        }
                        className="font-mono text-3xl leading-none tabular-nums md:text-4xl"
                        style={NUMBER_FLOW_BASELINE_STYLE}
                      />
                      <span className="pb-0.5 font-mono text-xl leading-none text-muted-foreground/70 md:text-2xl">
                        /
                      </span>
                      <NumberFlow
                        value={realtime.viewsLast30m}
                        plugins={
                          enableRollingNumber
                            ? CONTINUOUS_NUMBER_FLOW_PLUGINS
                            : undefined
                        }
                        className="font-mono text-3xl leading-none tabular-nums md:text-4xl"
                        style={NUMBER_FLOW_BASELINE_STYLE}
                      />
                    </div>
                  ) : (
                    <span
                      key="realtime-metrics-empty"
                      className="inline-flex items-end font-mono text-3xl font-semibold leading-none text-foreground tabular-nums md:text-4xl"
                    >
                      -- / -- / --
                    </span>
                  )}
                </AutoTransition>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AutoTransition
                  type="fade"
                  duration={0.16}
                  initial={false}
                  presenceMode="wait"
                  className="inline-flex items-center gap-2"
                >
                  <span
                    key={`realtime-status-${realtime.status}`}
                    className="inline-flex items-center gap-2"
                  >
                    <RealtimeStatusDot status={realtime.status} />
                    <span>{statusLabel}</span>
                  </span>
                </AutoTransition>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] px-4 md:px-6">
        <div className="space-y-6">
          <RealtimeTrafficTrendCard
            locale={locale}
            messages={messages}
            hasConnected={realtime.hasConnected}
            events={realtime.events}
          />
          <RealtimeLogStreamCard
            locale={locale}
            messages={messages}
            hasConnected={realtime.hasConnected}
            events={realtime.events}
            visits={realtime.visits}
          />
          <RealtimeSummaryCardsSection
            locale={locale}
            messages={messages}
            siteId={siteId}
            siteDomain={siteDomain}
            visits={realtime.visits}
            filters={requestFilters}
          />
        </div>
      </div>
    </div>
  );
}
