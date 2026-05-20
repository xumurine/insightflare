import { notFound } from "next/navigation";

import { AdminSitesManagementClient } from "@/components/dashboard/admin-sites-management-client";
import { canManageTeam } from "@/lib/dashboard/permissions";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface ManageSitesPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export async function generateMetadata({ params }: ManageSitesPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.adminSites.title,
  };
}

export default async function ManageSitesPage({
  params,
}: ManageSitesPageProps) {
  const { locale, teamSlug } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const profile = await getDashboardProfile();

  if (!profile) {
    notFound();
  }

  const activeTeam = profile.teams.find((team) => team.slug === teamSlug);
  if (!activeTeam) {
    notFound();
  }
  if (!canManageTeam(activeTeam.membershipRole, profile.user.systemRole)) {
    notFound();
  }

  return (
    <AdminSitesManagementClient
      locale={resolvedLocale}
      messages={messages}
      activeTeam={activeTeam}
    />
  );
}
