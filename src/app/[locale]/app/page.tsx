import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutActionButton } from "@/components/auth/logout-action-button";
import { resolveLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { getDashboardProfile } from "@/lib/dashboard/server";

interface AppRootPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AppRootPage({ params }: AppRootPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const t = getMessages(resolvedLocale);
  const profile = await getDashboardProfile();

  if (profile && profile.teams.length === 1) {
    redirect(`/${resolvedLocale}/app/${profile.teams[0].slug}`);
  }

  if (profile && profile.teams.length > 0) {
    return (
      <main className="grid min-h-svh place-items-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t.teamEntry.title}</CardTitle>
            <CardDescription>{t.teamEntry.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {profile.teams.map((team) => (
              <Button
                key={team.id}
                asChild
                variant="outline"
                className="w-full justify-between"
              >
                <Link href={`/${resolvedLocale}/app/${team.slug}`}>
                  <span className="truncate">{team.name}</span>
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </main>
    );
  }

  const noTeams = !profile || profile.teams.length === 0;

  return (
    <main className="grid min-h-svh place-items-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t.appName}</CardTitle>
          <CardDescription>{noTeams ? t.empty.noTeams : t.empty.noSites}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Button asChild>
            <a href={`/${resolvedLocale}/login`}>{t.login.title}</a>
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
