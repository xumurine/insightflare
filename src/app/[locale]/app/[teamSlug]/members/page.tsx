import { redirect } from "next/navigation";

import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface TeamMembersPageProps {
  params: Promise<{
    locale: string;
    teamSlug: string;
  }>;
}

export async function generateMetadata({ params }: TeamMembersPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.teamManagement.members.title,
  };
}

export default async function TeamMembersPage({
  params,
}: TeamMembersPageProps) {
  const { locale, teamSlug } = await params;
  redirect(`/${resolveLocale(locale)}/app/${teamSlug}/settings`);
}
