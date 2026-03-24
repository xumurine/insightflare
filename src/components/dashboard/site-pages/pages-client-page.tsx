"use client";

import { PageHeading } from "@/components/dashboard/page-heading";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface PagesClientPageProps {
  locale: Locale;
  messages: AppMessages;
  siteId: string;
  pathname: string;
}

export function PagesClientPage({ messages }: PagesClientPageProps) {
  return (
    <div className="space-y-6">
      <PageHeading
        title={messages.pages.title}
        subtitle={messages.pages.subtitle}
      />
    </div>
  );
}
