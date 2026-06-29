import { notFound } from "next/navigation";

import { AdminUsersManagementClient } from "@/components/dashboard/admin-users-management-client";
import { RootDashboardShell } from "@/components/dashboard/root-dashboard-shell";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface ManageUsersPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: ManageUsersPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.adminUsers.title,
  };
}

export default async function ManageUsersPage({
  params,
}: ManageUsersPageProps) {
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
      pathname={`/${resolvedLocale}/app/manage/users`}
    >
      <AdminUsersManagementClient
        locale={resolvedLocale}
        messages={messages}
        currentUserId={profile.user.id}
      />
    </RootDashboardShell>
  );
}
