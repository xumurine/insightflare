import { notFound } from "next/navigation";

import { LandingEmbedClient } from "@/components/embeds/landing-embed-client";
import { APP_NAME } from "@/lib/constants";
import {
  isLandingEmbedView,
  LANDING_EMBED_DEMO_SITE,
  type LandingEmbedView,
  normalizeLandingEmbedView,
} from "@/lib/embeds/landing";
import { resolveLocale } from "@/lib/i18n/config";
import { type AppMessages, getMessages } from "@/lib/i18n/messages";

interface LandingEmbedPageProps {
  params: Promise<{
    locale: string;
    view: string;
  }>;
}

export const dynamic = "force-dynamic";

function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "1";
}

function embedTitle(messages: AppMessages, view: LandingEmbedView): string {
  const embedView = normalizeLandingEmbedView(view);
  if (embedView === "overview-metrics") return messages.overview.title;
  if (embedView === "traffic-trend") return messages.overview.trendTitle;
  if (embedView === "traffic-pages") return messages.pages.title;
  if (embedView === "traffic-sources") return messages.overview.sourceTab;
  if (embedView === "traffic-clients") return messages.devices.title;
  if (embedView === "traffic-geo") return messages.geo.title;
  if (embedView === "geo-map") return messages.geo.mapTitle;
  if (embedView.startsWith("realtime-")) return messages.realtime.title;
  if (view === "retention") return messages.retention.title;
  if (view === "pages") return messages.pages.title;
  if (embedView.startsWith("events-")) return messages.events.title;
  if (embedView.startsWith("browsers-")) return messages.browsers.title;
  if (embedView.startsWith("devices-")) return messages.devices.title;
  if (view === "sessions") return messages.sessions.title;
  if (view === "visitors") return messages.visitors.title;
  if (view === "funnels") return messages.funnels.title;
  return messages.performance.title;
}

export async function generateMetadata({ params }: LandingEmbedPageProps) {
  const { locale, view } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const title = isLandingEmbedView(view)
    ? embedTitle(messages, view)
    : APP_NAME;

  return {
    title: `${title} · ${LANDING_EMBED_DEMO_SITE.siteName} · ${APP_NAME}`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function LandingEmbedPage({
  params,
}: LandingEmbedPageProps) {
  const { locale, view } = await params;
  const resolvedLocale = resolveLocale(locale);

  if (!isDemoMode() || !isLandingEmbedView(view)) {
    notFound();
  }

  return (
    <LandingEmbedClient
      locale={resolvedLocale}
      messages={getMessages(resolvedLocale)}
      view={view}
    />
  );
}
