import { RiLoginBoxLine, RiTranslate2 } from "@remixicon/react";
import { createFileRoute } from "@tanstack/react-router";

import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "@/lib/router";

function safeNextPath(value: string | undefined, locale: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return `/${locale}/app`;
  const pathname = value.split("?")[0].replace(/\/+$/, "");
  return pathname === "/login" || pathname.endsWith("/login")
    ? `/${locale}/app`
    : value;
}
function withNext(pathname: string, nextPath: string) {
  const params = new URLSearchParams();
  if (nextPath) params.set("next", nextPath);
  return params.size ? `${pathname}?${params}` : pathname;
}
export const Route = createFileRoute("/$locale/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.login.title }],
  }),
  component: Page,
});
function Page() {
  const { locale, messages: t } = Route.useRouteContext();
  const nextPath = safeNextPath(Route.useSearch().next, locale);
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
              <RiLoginBoxLine className="size-5" />
              {t.login.title}
            </CardTitle>
            <div className="flex items-center gap-1">
              <ThemeToggle
                lightLabel={t.actions.switchToLight}
                darkLabel={t.actions.switchToDark}
                className="w-fit self-end"
              />
              {(["en", "zh", "ja"] as const).map((item) => (
                <Button
                  key={item}
                  variant={locale === item ? "default" : "outline"}
                  size="xs"
                  asChild
                >
                  <Link href={withNext(`/${item}/login`, nextPath)}>
                    <RiTranslate2 className="size-3" />
                    <span>
                      {item === "en"
                        ? t.actions.switchToEnglish
                        : item === "zh"
                          ? t.actions.switchToChinese
                          : t.actions.switchToJapanese}
                    </span>
                  </Link>
                </Button>
              ))}
            </div>
          </div>
          <CardDescription>{t.login.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <LoginForm
            locale={locale}
            nextPath={nextPath}
            usernameLabel={t.login.username}
            passwordLabel={t.login.password}
            signInLabel={t.login.signIn}
            signingInLabel={t.loginForm.signingIn}
            verifyingSecurityLabel={t.loginForm.verifyingSecurity}
            securityVerificationFailedLabel={
              t.loginForm.securityVerificationFailed
            }
            securityVerificationTitleLabel={
              t.loginForm.securityVerificationTitle
            }
            retrySecurityLabel={t.loginForm.retrySecurityVerification}
            redirectingLabel={t.loginForm.redirecting}
            invalidCredentialsLabel={t.login.invalidCredentials}
            failedLabel={t.loginForm.failed}
          />
        </CardContent>
      </Card>
    </main>
  );
}
