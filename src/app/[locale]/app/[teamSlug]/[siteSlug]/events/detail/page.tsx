import { notFound, redirect } from "next/navigation";

import { buildSitePath, getTeamSiteContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface EventTypeDetailPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstSearchValue(
  search: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = search[key];
  return Array.isArray(value) ? value[0]?.trim() || "" : value?.trim() || "";
}

function toSearchParams(
  search: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) params.append(key, item);
      }
      continue;
    }
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
    }
  }
  return params;
}

export async function generateMetadata({
  params,
  searchParams,
}: EventTypeDetailPageProps) {
  const { locale } = await params;
  const search = await searchParams;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const eventName =
    firstSearchValue(search, "detail") || firstSearchValue(search, "eventName");

  return {
    title: eventName || messages.events.detailTitle,
  };
}

export default async function EventTypeDetailPage({
  params,
  searchParams,
}: EventTypeDetailPageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const search = await searchParams;

  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  const eventsPath = buildSitePath(
    resolvedLocale,
    context.activeTeam.slug,
    context.activeSite.slug,
    "events",
  );
  const paramsCopy = toSearchParams(search);
  const detail =
    paramsCopy.get("detail")?.trim() ||
    paramsCopy.get("eventName")?.trim() ||
    "";
  paramsCopy.delete("detail");
  paramsCopy.delete("eventName");
  if (detail) {
    paramsCopy.set("detail", detail);
  }

  const query = paramsCopy.toString();
  redirect(query ? `${eventsPath}?${query}` : eventsPath);
}
