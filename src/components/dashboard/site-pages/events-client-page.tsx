"use client";

import { PageHeading } from "@/components/dashboard/page-heading";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface EventsClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

export function EventsClientPage({ messages }: EventsClientPageProps) {
  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.events.title}
        subtitle={messages.events.subtitle}
      />
    </div>
  );
}
