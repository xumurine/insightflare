import {
  RiExternalLinkLine,
  RiGitBranchLine,
  RiGitCommitLine,
  RiPriceTag3Line,
  RiRocketLine,
} from "@remixicon/react";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { PageHeading } from "@/components/dashboard/page-heading";
import { VersionUpdateDetailsButton } from "@/components/dashboard/version-update-details-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { intlLocale } from "@/lib/dashboard/format";
import { loadVersionReleases } from "@/lib/dashboard/route-data";
import { type GithubRelease } from "@/lib/github-releases";
import { type Locale, resolveLocale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { dashboardPageTitle } from "@/lib/page-title";
import Link from "@/lib/router";
import { cn } from "@/lib/utils";

const REPO_RELEASES_URL = "https://github.com/RavelloH/InsightFlare/releases";
const CURRENT_VERSION = import.meta.env.VITE_APP_VERSION || "0.0.0";
const CURRENT_COMMIT = import.meta.env.VITE_COMMIT_SHA || null;

function formatCommit(hash: string | null | undefined): string {
  const value = hash?.trim();
  if (!value) return "-";
  return value.length > 12 ? value.slice(0, 12) : value;
}

function isCommitMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = left?.trim().toLowerCase() || "";
  const normalizedRight = right?.trim().toLowerCase() || "";
  if (!normalizedLeft || !normalizedRight) return false;

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(normalizedRight) ||
    normalizedRight.startsWith(normalizedLeft)
  );
}

function normalizeVersion(value: string | null | undefined): string {
  return (value || "").trim().replace(/^v/i, "").toLowerCase();
}

function releaseDate(
  release: Pick<GithubRelease, "publishedAt" | "createdAt">,
): string {
  return release.publishedAt ?? release.createdAt;
}

function formatDateTime(locale: Locale, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function releaseStatus(
  release: Pick<GithubRelease, "draft" | "prerelease">,
  labels: AppMessages["managementPages"]["versionUpdates"],
): { label: string; variant: "default" | "secondary" | "outline" } {
  if (release.draft) {
    return { label: labels.statusDraft, variant: "outline" };
  }

  if (release.prerelease) {
    return { label: labels.statusPrerelease, variant: "secondary" };
  }

  return { label: labels.statusStable, variant: "default" };
}

export const Route = createFileRoute("/$locale/app/manage/version-updates")({
  beforeLoad: ({ context }) => {
    if (context.dashboardRoot?.user.systemRole !== "admin") throw notFound();
  },
  loader: () => loadVersionReleases(),
  head: ({ match }) => ({
    meta: [
      {
        title: dashboardPageTitle(
          match.context.messages.managementNav.versionUpdates,
          match.context,
        ),
      },
    ],
  }),
  component: Page,
});

function Page() {
  const { locale, messages } = Route.useRouteContext();
  const { releases, error } = Route.useLoaderData();
  const resolvedLocale = resolveLocale(locale);
  const labels = messages.managementPages.versionUpdates;
  const latestStableRelease =
    releases.find((release) => !release.draft && !release.prerelease) ??
    releases[0] ??
    null;
  const currentRelease =
    releases.find(
      (release) =>
        normalizeVersion(release.tagName) === normalizeVersion(CURRENT_VERSION),
    ) ?? null;
  const stableReleaseTags = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => release.tagName);
  const hasUpdate =
    latestStableRelease !== null &&
    normalizeVersion(latestStableRelease.tagName) !==
      normalizeVersion(CURRENT_VERSION);
  const detailLabels = {
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
            <Link href={REPO_RELEASES_URL} target="_blank" rel="noreferrer">
              <RiExternalLinkLine />
              {labels.source}
            </Link>
          </Button>
        }
      />

      <Card className="py-0">
        <CardContent className="p-0">
          <div className="grid gap-px overflow-hidden bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
            <VersionMetric
              icon={<RiPriceTag3Line className="size-[11px]" />}
              label={labels.currentVersion}
              value={`v${CURRENT_VERSION}`}
            />
            <VersionMetric
              icon={<RiRocketLine className="size-[11px]" />}
              label={labels.latestVersion}
              value={latestStableRelease?.tagName ?? "-"}
              valueClassName={hasUpdate ? "text-primary" : "text-foreground"}
            />
            <VersionMetric
              icon={<RiGitCommitLine className="size-[11px]" />}
              label={labels.currentCommit}
              value={formatCommit(CURRENT_COMMIT)}
            />
            <VersionMetric
              icon={<RiGitBranchLine className="size-[11px]" />}
              label={labels.releaseCount}
              value={String(releases.length)}
            />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <RiGitBranchLine className="size-8 text-muted-foreground/70" />
            <p>{labels.loadFailed}</p>
            <p className="max-w-xl break-words font-mono text-xs">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      {releases.length === 0 && !error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            <RiGitBranchLine className="size-8 text-muted-foreground/70" />
            <p>{labels.empty}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {releases.map((release) => {
          const status = releaseStatus(release, labels);
          const isCurrent =
            currentRelease !== null && release.id === currentRelease.id;
          const isCurrentDeployment = isCommitMatch(
            release.targetCommitish,
            CURRENT_COMMIT,
          );
          const releaseStableIndex = stableReleaseTags.findIndex(
            (tagName) => tagName === release.tagName,
          );
          const previousStableTag =
            releaseStableIndex >= 0
              ? stableReleaseTags[releaseStableIndex + 1] || null
              : null;
          const summary = release.body?.trim() || "";

          return (
            <Card key={release.id}>
              <CardContent
                className={cn(
                  "space-y-4 p-4 md:p-5",
                  isCurrentDeployment && "border-l-2 border-l-primary",
                )}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-mono text-xl font-semibold">
                        {release.tagName}
                      </h2>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {isCurrent ? (
                        <Badge variant="outline">
                          {labels.currentVersionBadge}
                        </Badge>
                      ) : null}
                      {isCurrentDeployment ? (
                        <Badge variant="outline">
                          {labels.currentCommitBadge}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {labels.publishedAt}:{" "}
                        {formatDateTime(resolvedLocale, releaseDate(release))}
                      </span>
                      <span>
                        {labels.author}: {release.authorLogin || labels.unknown}
                      </span>
                      <span>
                        {labels.commit}:{" "}
                        <span className="font-mono">
                          {formatCommit(release.targetCommitish)}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <VersionUpdateDetailsButton
                      baseTag={previousStableTag}
                      headRef={release.targetCommitish || release.tagName}
                      releaseTag={release.tagName}
                      currentCommit={CURRENT_COMMIT}
                      labels={detailLabels}
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
                </div>

                <div className="border-t pt-4">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">
                    {labels.releaseNotes}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
                    {summary || labels.empty}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function VersionMetric({
  icon,
  label,
  value,
  valueClassName = "text-foreground",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 bg-card p-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
        <p className="min-w-0 truncate text-[11px] uppercase text-muted-foreground">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "mt-3 min-w-0 truncate font-mono text-xl leading-7 font-semibold tabular-nums",
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}
