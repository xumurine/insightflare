import { notFound } from "next/navigation";

import { ApiKeysClient } from "@/components/dashboard/api-keys-client";
import { PageHeading } from "@/components/dashboard/page-heading";
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
      <ApiKeysClient
        locale={resolvedLocale}
        messages={messages}
        teamId={context.activeTeam.id}
        sites={context.sites.map((site) => ({
          id: site.id,
          name: site.name,
          domain: site.domain,
        }))}
      />
    </div>
  );
}
