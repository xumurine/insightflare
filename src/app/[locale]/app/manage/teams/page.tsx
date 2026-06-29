import { notFound } from "next/navigation";

import { AdminTeamsManagementClient } from "@/components/dashboard/admin-teams-management-client";
import { RootDashboardShell } from "@/components/dashboard/root-dashboard-shell";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface ManageTeamsPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: ManageTeamsPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.adminTeams.title,
  };
}

export default async function ManageTeamsPage({
  params,
}: ManageTeamsPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const profile = await getDashboardProfile();

  if (!profile || profile.user.systemRole !== "admin") {
    notFound();
  }

  return (
    <RootDashboardShell
      locale={resolvedLocale}
      messages={messages}
      pathname={`/${resolvedLocale}/app/manage/teams`}
    >
      <AdminTeamsManagementClient locale={resolvedLocale} messages={messages} />
    </RootDashboardShell>
  );
}
