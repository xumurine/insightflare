"use client";

import dynamic from "next/dynamic";

import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

import type {
  GeoPointsMapCountryCount,
  GeoPointsMapPoint,
} from "./geo-points-map";

interface GeoPointsMapIslandProps {
  locale: Locale;
  messages: AppMessages;
  points: GeoPointsMapPoint[];
  countryCounts?: GeoPointsMapCountryCount[];
  loading?: boolean;
  emptyLabel?: string;
  heightClassName?: string;
  countryHoverEnabled?: boolean;
  pointColor?: [number, number, number];
  projectionMode?: "mercator" | "globe";
  autoRotate?: boolean;
  selectedCountryCode?: string | null;
  onCountrySelect?: (countryCode: string | null) => void;
  collapseOverlappingPointColors?: boolean;
  pointCrossfadeEnabled?: boolean;
}

const DEFAULT_MAP_HEIGHT_CLASS = "h-[460px]";

const GeoPointsMapClient = dynamic<GeoPointsMapIslandProps>(
  () =>
    import("@/components/dashboard/geo-points-map").then(
      (module) => module.GeoPointsMap,
    ),
  {
    ssr: false,
    loading: () => <GeoPointsMapFallback />,
  },
);

function GeoPointsMapFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/20">
      <Spinner className="size-6" />
    </div>
  );
}

export type { GeoPointsMapCountryCount, GeoPointsMapPoint };

export function GeoPointsMapIsland({
  heightClassName,
  ...props
}: GeoPointsMapIslandProps) {
  return (
    <div className={`${heightClassName ?? DEFAULT_MAP_HEIGHT_CLASS} w-full`}>
      <GeoPointsMapClient {...props} heightClassName="h-full" />
    </div>
  );
}
