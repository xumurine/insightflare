"use client";

import { PageHeading } from "@/components/dashboard/page-heading";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface ReferrersClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

export function ReferrersClientPage({ messages }: ReferrersClientPageProps) {
  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.referrers.title}
        subtitle={messages.referrers.subtitle}
      />
    </div>
  );
}
