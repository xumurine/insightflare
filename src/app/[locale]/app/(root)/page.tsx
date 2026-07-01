import Link from "next/link";
import { RiArrowRightSLine, RiLoginBoxLine } from "@remixicon/react";

import { LogoutActionButton } from "@/components/auth/logout-action-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboardRootContext } from "@/lib/dashboard/server";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

interface AppRootPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: AppRootPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const t = getMessages(resolvedLocale);

  return {
    title: t.teamEntry.title,
  };
}

export default async function AppRootPage({ params }: AppRootPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const t = getMessages(resolvedLocale);
  const context = await getDashboardRootContext();

  if (context && context.teams.length > 0) {
    return (
      <div className="grid h-[calc(100svh-8rem)] min-h-0 place-items-center overflow-hidden">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t.teamEntry.title}</CardTitle>
            <CardDescription>{t.teamEntry.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 p-4">
            {context.teams.map((team) => (
              <Button
                key={team.id}
                asChild
                variant="outline"
                className="w-full justify-between"
              >
                <Link href={`/${resolvedLocale}/app/${team.slug}`}>
                  <span className="truncate">{team.name}</span>
                  <RiArrowRightSLine className="size-4 text-muted-foreground" />
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const noTeams = !context || context.teams.length === 0;

  return (
    <main className="grid min-h-svh place-items-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t.appName}</CardTitle>
          <CardDescription>
            {noTeams ? t.empty.noTeams : t.empty.noSites}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Button asChild>
            <a href={`/${resolvedLocale}/login`}>
              <RiLoginBoxLine className="size-4" />
              <span>{t.login.title}</span>
            </a>
          </Button>
          <LogoutActionButton
            locale={resolvedLocale}
            label={t.actions.logout}
            pendingLabel={t.logoutAction.pending}
            successLabel={t.logoutAction.success}
            failedLabel={t.logoutAction.failed}
          />
        </CardContent>
      </Card>
    </main>
  );
}
