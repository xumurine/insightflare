import { notFound } from "next/navigation";
import { RiGitBranchLine } from "@remixicon/react";

import { PageHeading } from "@/components/dashboard/page-heading";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardTeamContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface VersionUpdatesPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export async function generateMetadata({ params }: VersionUpdatesPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.managementNav.versionUpdates,
  };
}

export default async function VersionUpdatesPage({
  params,
}: VersionUpdatesPageProps) {
  const { locale, teamSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const context = await getDashboardTeamContext(teamSlug);

  if (!context || context.user.systemRole !== "admin") {
    notFound();
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title={messages.managementNav.versionUpdates}
        subtitle={messages.managementPages.versionUpdates.subtitle}
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
          <RiGitBranchLine className="size-8 text-muted-foreground/70" />
          <p>{messages.managementPages.versionUpdates.empty}</p>
        </CardContent>
      </Card>
    </div>
  );
}
