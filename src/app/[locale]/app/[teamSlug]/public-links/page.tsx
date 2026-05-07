import { notFound } from "next/navigation";
import { RiLinksLine } from "@remixicon/react";

import { PageHeading } from "@/components/dashboard/page-heading";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardTeamContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface TeamPublicLinksPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export default async function TeamPublicLinksPage({
  params,
}: TeamPublicLinksPageProps) {
  const { locale, teamSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const context = await getDashboardTeamContext(teamSlug);

  if (!context) {
    notFound();
  }

  const copy = messages.teamManagement.publicLinks;

  return (
    <div className="space-y-4">
      <PageHeading title={copy.title} subtitle={copy.subtitle} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
          <RiLinksLine className="size-8 text-muted-foreground/70" />
          <p>{copy.empty}</p>
        </CardContent>
      </Card>
    </div>
  );
}
