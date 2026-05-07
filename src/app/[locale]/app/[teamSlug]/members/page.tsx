import { redirect } from "next/navigation";

import { resolveLocale } from "@/lib/i18n/config";

interface TeamMembersPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export default async function TeamMembersPage({
  params,
}: TeamMembersPageProps) {
  const { locale, teamSlug } = await params;
  redirect(`/${resolveLocale(locale)}/app/${teamSlug}/settings`);
}
