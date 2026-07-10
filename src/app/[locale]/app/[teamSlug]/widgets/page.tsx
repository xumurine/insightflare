import { RiHammerLine } from "@remixicon/react";

import { PageHeading } from "@/components/dashboard/page-heading";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface TeamWidgetsPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: TeamWidgetsPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.teamManagement.widgets.title,
  };
}

export default async function TeamWidgetsPage({
  params,
}: TeamWidgetsPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const copy = messages.teamManagement.widgets;

  return (
    <div className="space-y-4">
      <PageHeading title={copy.title} subtitle={copy.subtitle} />
      <div className="flex min-h-72 items-center justify-center border-y border-dashed">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center border bg-muted/30 text-muted-foreground">
            <RiHammerLine className="size-5" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">{copy.underConstruction}</p>
        </div>
      </div>
    </div>
  );
}
