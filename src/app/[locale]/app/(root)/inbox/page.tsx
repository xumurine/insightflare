import { NotificationCenterClient } from "@/components/dashboard/notification-center-client";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface InboxPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: InboxPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.notificationCenter.title,
  };
}

export default async function InboxPage({ params }: InboxPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return (
    <NotificationCenterClient locale={resolvedLocale} messages={messages} />
  );
}
