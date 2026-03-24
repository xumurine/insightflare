"use client";

import { PageHeading } from "@/components/dashboard/page-heading";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface RetentionClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

export function RetentionClientPage({ messages }: RetentionClientPageProps) {
  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.retention.title}
        subtitle={messages.retention.subtitle}
      />
    </div>
  );
}
