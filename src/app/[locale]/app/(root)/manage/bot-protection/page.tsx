import { notFound } from "next/navigation";

import { BotProtectionClient } from "@/components/dashboard/bot-protection-client";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface BotProtectionPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: BotProtectionPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.botProtection.title,
  };
}

export default async function BotProtectionPage({
  params,
}: BotProtectionPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const profile = await getDashboardProfile();

  if (!profile || profile.user.systemRole !== "admin") {
    notFound();
  }

  return <BotProtectionClient locale={resolvedLocale} messages={messages} />;
}
