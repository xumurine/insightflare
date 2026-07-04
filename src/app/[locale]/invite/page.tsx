import Link from "next/link";
import { RiMailSendLine } from "@remixicon/react";

import { AccountLinkPageActions } from "@/components/auth/account-link-page-actions";
import { InviteLinkForm } from "@/components/auth/invite-link-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface InvitePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: InvitePageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const t = getMessages(resolvedLocale);
  return { title: t.accountLinks.invite.title };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const t = getMessages(resolvedLocale);

  return (
    <main className="grid min-h-svh place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="py-8 w-full text-4xl flex items-center justify-center text-primary">
            <Link
              href="https://github.com/RavelloH/InsightFlare"
              target="_blank"
            >
              {t.appName}
            </Link>
          </div>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="inline-flex items-center gap-2 text-xl">
              <RiMailSendLine className="size-5" />
              {t.accountLinks.invite.title}
            </CardTitle>
            <AccountLinkPageActions
              locale={resolvedLocale}
              path="/invite"
              lightLabel={t.actions.switchToLight}
              darkLabel={t.actions.switchToDark}
              englishLabel={t.actions.switchToEnglish}
              chineseLabel={t.actions.switchToChinese}
            />
          </div>
          <CardDescription>{t.accountLinks.invite.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <InviteLinkForm
            locale={resolvedLocale}
            copy={t.accountLinks.invite}
          />
        </CardContent>
      </Card>
    </main>
  );
}
