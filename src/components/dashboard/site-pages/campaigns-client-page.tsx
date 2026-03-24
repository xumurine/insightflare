"use client";

import { PageHeading } from "@/components/dashboard/page-heading";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface CampaignsClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

export function CampaignsClientPage({ messages }: CampaignsClientPageProps) {
  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.campaigns.title}
        subtitle={messages.campaigns.subtitle}
      />
    </div>
  );
}
