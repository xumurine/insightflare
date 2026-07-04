import Link from "next/link";
import { notFound } from "next/navigation";
import {
  RiExternalLinkLine,
  RiGitBranchLine,
  RiGitCommitLine,
  RiPriceTag3Line,
  RiRocketLine,
} from "@remixicon/react";

import { PageHeading } from "@/components/dashboard/page-heading";
import { VersionUpdateDetailsButton } from "@/components/dashboard/version-update-details-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardProfile } from "@/lib/dashboard/server";
import { fetchGithubReleases, type GithubRelease } from "@/lib/github-releases";
import { type Locale, resolveLocale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { getMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

interface VersionUpdatesPageProps {
  params: Promise<{
    locale: string;
  }>;
}

const REPO_OWNER = "RavelloH";
const REPO_NAME = "InsightFlare";
const REPO_RELEASES_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`;
const CURRENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";

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

function currentCommitHash(): string | null {
  return process.env.COMMIT_SHA || null;
}

function normalizeVersion(value: string | null | undefined): string {
  return (value || "").trim().replace(/^v/i, "").toLowerCase();
}

function releaseDate(
  release: Pick<GithubRelease, "publishedAt" | "createdAt">,
) {
  return release.publishedAt ?? release.createdAt;
}

function formatDateTime(locale: Locale, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
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
    return {
      label: labels.statusDraft,
      variant: "outline",
    };
  }

  if (release.prerelease) {
    return {
      label: labels.statusPrerelease,
      variant: "secondary",
    };
  }

  return {
    label: labels.statusStable,
    variant: "default",
  };
}

function releaseSummary(body: string | null): string {
  return body?.trim() || "";
}

async function loadReleases(): Promise<{
  releases: GithubRelease[];
  error: string | null;
}> {
  try {
    return {
      releases: await fetchGithubReleases(REPO_OWNER, REPO_NAME),
      error: null,
    };
  } catch (error) {
    console.error("[version-updates] Failed to load releases:", error);
    return {
      releases: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function generateMetadata({ params }: VersionUpdatesPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);

  return {
    title: messages.managementNav.versionUpdates,
  };
}

export default async function VersionUpdatesPage({
  params,
}: VersionUpdatesPageProps) {
  const { locale } = await params;
  const resolvedLocale = resolveLocale(locale);
  const messages = getMessages(resolvedLocale);
  const labels = messages.managementPages.versionUpdates;
  const profile = await getDashboardProfile();

  if (!profile || profile.user.systemRole !== "admin") {
    notFound();
  }

  const { releases, error } = await loadReleases();
  const latestStableRelease =
    releases.find((release) => !release.draft && !release.prerelease) ??
    releases[0] ??
    null;
  const currentRelease =
    releases.find(
      (release) =>
        normalizeVersion(release.tagName) === normalizeVersion(CURRENT_VERSION),
    ) ?? null;
  const runtimeCommit = currentCommitHash();
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
  const stableReleaseTags = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => release.tagName);
  const hasUpdate =
    latestStableRelease !== null &&
    normalizeVersion(latestStableRelease.tagName) !==
      normalizeVersion(CURRENT_VERSION);

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
            <div className="min-w-0 bg-card p-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex shrink-0 items-center justify-center text-muted-foreground">
                  <RiPriceTag3Line className="size-[11px]" />
                </span>
                <p className="min-w-0 truncate text-[11px] uppercase text-muted-foreground">
                  {labels.currentVersion}
                </p>
              </div>
              <p className="mt-3 min-w-0 truncate font-mono text-xl leading-7 font-semibold text-foreground tabular-nums">
                v{CURRENT_VERSION}
              </p>
            </div>
            <div className="min-w-0 bg-card p-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex shrink-0 items-center justify-center text-muted-foreground">
                  <RiRocketLine className="size-[11px]" />
                </span>
                <p className="min-w-0 truncate text-[11px] uppercase text-muted-foreground">
                  {labels.latestVersion}
                </p>
              </div>
              <p
                className={cn(
                  "mt-3 min-w-0 truncate font-mono text-xl leading-7 font-semibold tabular-nums",
                  hasUpdate ? "text-primary" : "text-foreground",
                )}
              >
                {latestStableRelease?.tagName ?? "-"}
              </p>
            </div>
            <div className="min-w-0 bg-card p-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex shrink-0 items-center justify-center text-muted-foreground">
                  <RiGitCommitLine className="size-[11px]" />
                </span>
                <p className="min-w-0 truncate text-[11px] uppercase text-muted-foreground">
                  {labels.currentCommit}
                </p>
              </div>
              <p className="mt-3 min-w-0 truncate font-mono text-xl leading-7 font-semibold text-foreground tabular-nums">
                {formatCommit(runtimeCommit)}
              </p>
            </div>
            <div className="min-w-0 bg-card p-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex shrink-0 items-center justify-center text-muted-foreground">
                  <RiGitBranchLine className="size-[11px]" />
                </span>
                <p className="min-w-0 truncate text-[11px] uppercase text-muted-foreground">
                  {labels.releaseCount}
                </p>
              </div>
              <p className="mt-3 min-w-0 truncate font-mono text-xl leading-7 font-semibold text-foreground tabular-nums">
                {releases.length}
              </p>
            </div>
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
            runtimeCommit,
          );
          const summary = releaseSummary(release.body);
          const releaseStableIndex = stableReleaseTags.findIndex(
            (tagName) => tagName === release.tagName,
          );
          const previousStableTag =
            releaseStableIndex >= 0
              ? stableReleaseTags[releaseStableIndex + 1] || null
              : null;

          return (
            <Card key={release.id}>
              <CardContent
                className={`space-y-4 p-4 md:p-5 ${
                  isCurrentDeployment ? "border-l-2 border-l-primary" : ""
                }`}
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
                      currentCommit={runtimeCommit}
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
