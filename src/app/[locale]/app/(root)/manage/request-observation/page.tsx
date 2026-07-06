import { notFound } from "next/navigation";

import { RequestObservationClient } from "@/components/dashboard/request-observation-client";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface RequestObservationPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({
  params,
}: RequestObservationPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.requestObservation.title,
  };
}

export default async function RequestObservationPage({
  params,
}: RequestObservationPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const profile = await getDashboardProfile();

  if (!profile || profile.user.systemRole !== "admin") {
    notFound();
  }

  return (
    <RequestObservationClient locale={resolvedLocale} messages={messages} />
  );
}
