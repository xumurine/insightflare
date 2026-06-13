import { notFound, redirect } from "next/navigation";

import { buildSitePath, getTeamSiteContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";

interface FunnelsRedirectPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
    siteSlug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FunnelsRedirectPage({
  params,
  searchParams,
}: FunnelsRedirectPageProps) {
  const { locale, teamSlug, siteSlug } = await params;
  const queryInput = (await searchParams) ?? {};
  const resolvedLocale = resolveLocale(locale);
  const context = await getTeamSiteContext(teamSlug, siteSlug);
  if (!context) notFound();

  const target = buildSitePath(
    resolvedLocale,
    context.activeTeam.slug,
    context.activeSite.slug,
    "funnel",
  );
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(queryInput)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }
  const encoded = query.toString();
  redirect(encoded ? `${target}?${encoded}` : target);
}
