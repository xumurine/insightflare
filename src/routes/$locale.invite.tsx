import { RiMailSendLine } from "@remixicon/react";
import { createFileRoute } from "@tanstack/react-router";

import { AccountLinkPageActions } from "@/components/auth/account-link-page-actions";
import { InviteLinkForm } from "@/components/auth/invite-link-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dashboardPageTitle } from "@/lib/page-title";
import Link from "@/lib/router";
export const Route = createFileRoute("/$locale/invite")({
  head: ({ match }) => ({
    meta: [
      {
        title: dashboardPageTitle(
          match.context.messages.accountLinks.invite.title,
          match.context,
        ),
      },
    ],
  }),
  component: Page,
});
function Page() {
  const { locale, messages: t } = Route.useRouteContext();
  return (
    <main className="grid min-h-svh place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex w-full items-center justify-center py-8 text-4xl text-primary">
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
              locale={locale}
              path="/invite"
              lightLabel={t.actions.switchToLight}
              darkLabel={t.actions.switchToDark}
              englishLabel={t.actions.switchToEnglish}
              chineseLabel={t.actions.switchToChinese}
              japaneseLabel={t.actions.switchToJapanese}
            />
          </div>
          <CardDescription>{t.accountLinks.invite.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <InviteLinkForm locale={locale} copy={t.accountLinks.invite} />
        </CardContent>
      </Card>
    </main>
  );
}
