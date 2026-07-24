import { createFileRoute, notFound } from "@tanstack/react-router";

import { LandingEmbedClient } from "@/components/embeds/landing-embed-client";
import { APP_NAME } from "@/lib/constants";
import {
  isLandingEmbedView,
  LANDING_EMBED_DEMO_SITE,
  type LandingEmbedView,
  normalizeLandingEmbedView,
} from "@/lib/embeds/landing";
import type { AppMessages } from "@/lib/i18n/messages";

function embedTitle(messages: AppMessages, view: LandingEmbedView) {
  const normalized = normalizeLandingEmbedView(view);
  if (normalized === "overview-metrics") return messages.overview.title;
  if (normalized === "traffic-trend") return messages.overview.trendTitle;
  if (normalized === "traffic-pages" || view === "pages")
    return messages.pages.title;
  if (normalized === "traffic-sources") return messages.overview.sourceTab;
  if (normalized === "traffic-clients") return messages.devices.title;
  if (normalized === "traffic-geo") return messages.geo.title;
  if (normalized === "geo-map") return messages.geo.mapTitle;
  if (normalized.startsWith("realtime-")) return messages.realtime.title;
  if (view === "retention") return messages.retention.title;
  if (normalized.startsWith("events-")) return messages.events.title;
  if (normalized.startsWith("browsers-")) return messages.browsers.title;
  if (normalized.startsWith("devices-")) return messages.devices.title;
  if (view === "sessions") return messages.sessions.title;
  if (view === "visitors") return messages.visitors.title;
  if (view === "funnels") return messages.funnels.title;
  return messages.performance.title;
}
export const Route = createFileRoute("/$locale/embeds/landing/$view")({
  beforeLoad: ({ params }) => {
    if (
      import.meta.env.VITE_DEMO_MODE !== "1" ||
      !isLandingEmbedView(params.view)
    )
      throw notFound();
  },
  head: ({ match, params }) => ({
    meta: [
      {
        title: isLandingEmbedView(params.view)
          ? `${embedTitle(match.context.messages, params.view)} · ${LANDING_EMBED_DEMO_SITE.siteName} · ${APP_NAME}`
          : APP_NAME,
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});
function Page() {
  const { locale, messages } = Route.useRouteContext();
  const { view } = Route.useParams();
  if (!isLandingEmbedView(view)) throw notFound();
  return <LandingEmbedClient locale={locale} messages={messages} view={view} />;
}
