import { notFound } from "next/navigation";
import { RiKey2Line } from "@remixicon/react";

import { PageHeading } from "@/components/dashboard/page-heading";
import { Card, CardContent } from "@/components/ui/card";
import { canManageTeam } from "@/lib/dashboard/permissions";
import { getDashboardTeamContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface TeamApiKeysPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export async function generateMetadata({ params }: TeamApiKeysPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.teamManagement.apiKeys.title,
  };
}

export default async function TeamApiKeysPage({
  params,
}: TeamApiKeysPageProps) {
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

  const copy = messages.teamManagement.apiKeys;

  return (
    <div className="space-y-4">
      <PageHeading title={copy.title} subtitle={copy.subtitle} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
          <RiKey2Line className="size-8 text-muted-foreground/70" />
          <p>{copy.empty}</p>
        </CardContent>
      </Card>
    </div>
  );
}
