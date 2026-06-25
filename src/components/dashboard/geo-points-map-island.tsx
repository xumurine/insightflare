"use client";

import dynamic from "next/dynamic";

import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

export interface GeoPointsMapPoint {
  latitude: number;
  longitude: number;
  country: string;
}

export interface GeoPointsMapCountryCount {
  country: string;
  views: number;
  sessions: number;
  visitors: number;
}

interface GeoPointsMapIslandProps {
  locale: Locale;
  messages: AppMessages;
  points: GeoPointsMapPoint[];
  countryCounts?: GeoPointsMapCountryCount[];
  loading?: boolean;
  emptyLabel?: string;
  heightClassName?: string;
  selectedCountryCode?: string | null;
  onCountrySelect?: (countryCode: string | null) => void;
}

const GeoPointsMapClient = dynamic<GeoPointsMapIslandProps>(
  () =>
    import("@/components/dashboard/geo-points-map").then(
      (module) => module.GeoPointsMap,
    ),
  {
    ssr: false,
    loading: () => <GeoPointsMapLoading />,
  },
);

function GeoPointsMapLoading() {
  return (
    <div className="flex h-[460px] items-center justify-center overflow-hidden bg-muted/20">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
    </div>
  );
}

export function GeoPointsMapIsland(props: GeoPointsMapIslandProps) {
  return <GeoPointsMapClient {...props} />;
}
