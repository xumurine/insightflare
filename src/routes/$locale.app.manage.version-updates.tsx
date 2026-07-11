import {
  RiExternalLinkLine,
  RiGitBranchLine,
  RiPriceTag3Line,
} from "@remixicon/react";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { PageHeading } from "@/components/dashboard/page-heading";
import { VersionUpdateDetailsButton } from "@/components/dashboard/version-update-details-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadVersionReleases } from "@/lib/dashboard/route-data";
import Link from "@/lib/router";

export const Route = createFileRoute("/$locale/app/manage/version-updates")({
  beforeLoad: ({ context }) => {
    if (context.dashboardRoot?.user.systemRole !== "admin") throw notFound();
  },
  loader: () => loadVersionReleases(),
  head: ({ match }) => ({
    meta: [{ title: match.context.messages.managementNav.versionUpdates }],
  }),
  component: Page,
});
function Page() {
  const { messages } = Route.useRouteContext();
  const { releases, error } = Route.useLoaderData();
  const labels = messages.managementPages.versionUpdates;
  const stableTags = releases
    .filter((r) => !r.draft && !r.prerelease)
    .map((r) => r.tagName);
  const details = {
    viewDetails: labels.viewDetails,
    detailsTitle: labels.detailsTitle,
    detailsDescription: labels.detailsDescription,
    detailsLoading: labels.detailsLoading,
    detailsEmpty: labels.detailsEmpty,
    detailsFailed: labels.detailsFailed,
    currentCommitBadge: labels.currentCommitBadge,
    openCompare: labels.openCompare,
    openCommit: labels.openCommit,
    commitCount: labels.commitCount,
  };
  return (
    <div className="space-y-4">
      <PageHeading
        title={messages.managementNav.versionUpdates}
        subtitle={labels.subtitle}
        actions={
          <Button variant="outline" asChild>
            <Link
              href="https://github.com/RavelloH/InsightFlare/releases"
              target="_blank"
              rel="noreferrer"
            >
              <RiExternalLinkLine />
              {labels.source}
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <RiPriceTag3Line />
            <span className="text-sm text-muted-foreground">
              {labels.currentVersion}
            </span>
          </div>
          <span className="font-mono font-semibold">
            v{import.meta.env.VITE_APP_VERSION}
          </span>
        </CardContent>
      </Card>
      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
            <RiGitBranchLine className="size-8" />
            <p>{labels.loadFailed}</p>
            <p className="font-mono text-xs">{error}</p>
          </CardContent>
        </Card>
      ) : null}
      <div className="space-y-3">
        {releases.map((release) => {
          const previous =
            stableTags[stableTags.indexOf(release.tagName) + 1] ?? null;
          return (
            <Card key={release.id}>
              <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{release.name}</span>
                    <Badge
                      variant={
                        release.prerelease
                          ? "secondary"
                          : release.draft
                            ? "outline"
                            : "default"
                      }
                    >
                      {release.tagName}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {release.body || labels.unknown}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <VersionUpdateDetailsButton
                    baseTag={previous}
                    headRef={release.targetCommitish || release.tagName}
                    releaseTag={release.tagName}
                    currentCommit={null}
                    labels={details}
                  />
                  <Button variant="outline" asChild>
                    <Link
                      href={release.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <RiExternalLinkLine />
                      {labels.openRelease}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
