import Link from "next/link";
import { notFound } from "next/navigation";
import { RiApps2Line, RiArrowRightLine } from "@remixicon/react";

import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canManageTeam } from "@/lib/dashboard/permissions";
import { getDashboardTeamContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface TeamWidgetsPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export async function generateMetadata({ params }: TeamWidgetsPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.teamManagement.widgets.title,
  };
}

export default async function TeamWidgetsPage({
  params,
}: TeamWidgetsPageProps) {
  const { locale, teamSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const context = await getDashboardTeamContext(teamSlug);

  if (
    !context ||
    !canManageTeam(context.activeTeam.membershipRole, context.user.systemRole)
  ) {
    notFound();
  }

  const copy = messages.teamManagement.widgets;

  return (
    <div className="space-y-4">
      <PageHeading title={copy.title} subtitle={copy.subtitle} />

      {context.sites.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {context.sites.map((site) => (
            <Link
              key={site.id}
              href={`/${resolvedLocale}/app/${context.activeTeam.slug}/${site.slug}/funnels`}
              className="group block h-full outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
              aria-label={`${copy.openWidgets}: ${site.name}`}
              title={copy.openWidgets}
            >
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="inline-flex max-w-full items-center gap-2 text-base">
                      <RiApps2Line className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{site.name}</span>
                    </CardTitle>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {site.domain}
                    </p>
                  </div>
                  <RiArrowRightLine className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary" className="gap-1.5">
                    <RiApps2Line className="size-3.5" />
                    {copy.openWidgets}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {copy.noSites}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
