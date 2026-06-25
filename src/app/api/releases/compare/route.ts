import { NextResponse } from "next/server";

import { fetchGithubCompare } from "@/lib/github-releases";

const REPO_OWNER = "RavelloH";
const REPO_NAME = "InsightFlare";
const REF_PATTERN = /^[0-9A-Za-z._/-]+$/;

function readRef(url: URL, key: string): string {
  return (url.searchParams.get(key) || "").trim();
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const base = readRef(url, "base");
  const head = readRef(url, "head");

  if (!head || !REF_PATTERN.test(head)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Missing or invalid head ref.",
      },
      { status: 400 },
    );
  }

  if (!base || !REF_PATTERN.test(base)) {
    return NextResponse.json({
      ok: true,
      data: {
        htmlUrl: null,
        status: "initial",
        totalCommits: 0,
        commits: [],
      },
    });
  }

  try {
    const data = await fetchGithubCompare(REPO_OWNER, REPO_NAME, base, head);
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("[releases/compare] Failed to compare releases:", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to compare releases.",
      },
      { status: 502 },
    );
  }
}
