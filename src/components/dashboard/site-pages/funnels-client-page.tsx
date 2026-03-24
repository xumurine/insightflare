"use client";

import { PageHeading } from "@/components/dashboard/page-heading";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface FunnelsClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

export function FunnelsClientPage({ messages }: FunnelsClientPageProps) {
  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.funnels.title}
        subtitle={messages.funnels.subtitle}
      />
    </div>
  );
}
