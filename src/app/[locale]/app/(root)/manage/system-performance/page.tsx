import { notFound } from "next/navigation";

import { SystemPerformanceClient } from "@/components/dashboard/system-performance-client";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface SystemPerformancePageProps {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: SystemPerformancePageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.systemPerformance.title,
  };
}

export default async function SystemPerformancePage({
  params,
}: SystemPerformancePageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const profile = await getDashboardProfile();

  if (!profile || profile.user.systemRole !== "admin") {
    notFound();
  }

  return (
    <SystemPerformanceClient locale={resolvedLocale} messages={messages} />
  );
}
