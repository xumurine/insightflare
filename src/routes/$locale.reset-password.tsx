import { RiLockPasswordLine } from "@remixicon/react";
import { createFileRoute } from "@tanstack/react-router";

import { AccountLinkPageActions } from "@/components/auth/account-link-page-actions";
import { ResetPasswordLinkForm } from "@/components/auth/reset-password-link-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "@/lib/router";
export const Route = createFileRoute("/$locale/reset-password")({
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.accountLinks.resetPassword.title }],
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
              <RiLockPasswordLine className="size-5" />
              {t.accountLinks.resetPassword.title}
            </CardTitle>
            <AccountLinkPageActions
              locale={locale}
              path="/reset-password"
              lightLabel={t.actions.switchToLight}
              darkLabel={t.actions.switchToDark}
              englishLabel={t.actions.switchToEnglish}
              chineseLabel={t.actions.switchToChinese}
              japaneseLabel={t.actions.switchToJapanese}
            />
          </div>
          <CardDescription>
            {t.accountLinks.resetPassword.subtitle}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <ResetPasswordLinkForm
            locale={locale}
            copy={t.accountLinks.resetPassword}
          />
        </CardContent>
      </Card>
    </main>
  );
}
