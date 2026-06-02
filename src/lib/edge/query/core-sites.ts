import { requireSession } from "@/lib/edge/session-auth";
import type { Env } from "@/lib/edge/types";

import { normalizeFilterValue } from "./core-parsers";
import { badRequest, notFound, unauthorized } from "./core-responses";
import {
  PRIVATE_CACHE_HEADERS,
  PUBLIC_CACHE_HEADERS,
  type SiteRow,
} from "./core-types";

export async function resolvePrivateSite(
  request: Request,
  env: Env,
  url: URL,
): Promise<SiteRow | Response> {
  const session = await requireSession(request, env);
  if (!session) return unauthorized("Unauthorized", PRIVATE_CACHE_HEADERS);

  const siteId = normalizeFilterValue(url.searchParams.get("siteId"));
  if (!siteId) return badRequest("siteId is required", PRIVATE_CACHE_HEADERS);

  if (session.systemRole === "admin") {
    const site = await env.DB.prepare(
      "SELECT id,name,domain FROM sites WHERE id=? LIMIT 1",
    )
      .bind(siteId)
      .first<SiteRow>();
    return site ?? notFound("Site not found", PRIVATE_CACHE_HEADERS);
  }

  const site = await env.DB.prepare(
    `
      SELECT s.id, s.name, s.domain
      FROM sites s
      INNER JOIN teams t ON t.id = s.team_id
      LEFT JOIN team_members tm ON tm.team_id = s.team_id AND tm.user_id = ?
      WHERE s.id = ? AND (t.owner_user_id = ? OR tm.user_id IS NOT NULL)
      LIMIT 1
    `,
  )
    .bind(session.userId, siteId, session.userId)
    .first<SiteRow>();
  return site ?? notFound("Site not found", PRIVATE_CACHE_HEADERS);
}

export async function resolvePrivateTeam(
  request: Request,
  env: Env,
  url: URL,
): Promise<{ id: string } | Response> {
  const session = await requireSession(request, env);
  if (!session) return unauthorized("Unauthorized", PRIVATE_CACHE_HEADERS);

  const teamId = normalizeFilterValue(url.searchParams.get("teamId"));
  if (!teamId) return badRequest("teamId is required", PRIVATE_CACHE_HEADERS);

  if (session.systemRole === "admin") {
    const team = await env.DB.prepare("SELECT id FROM teams WHERE id=? LIMIT 1")
      .bind(teamId)
      .first<{ id: string }>();
    return team ?? notFound("Team not found", PRIVATE_CACHE_HEADERS);
  }

  const team = await env.DB.prepare(
    `
      SELECT t.id
      FROM teams t
      LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
      WHERE t.id = ? AND (t.owner_user_id = ? OR tm.user_id IS NOT NULL)
      LIMIT 1
    `,
  )
    .bind(session.userId, teamId, session.userId)
    .first<{ id: string }>();
  return team ?? notFound("Team not found", PRIVATE_CACHE_HEADERS);
}

export async function fetchPublicSite(
  env: Env,
  url: URL,
): Promise<SiteRow | Response> {
  const segments = url.pathname.split("/").filter(Boolean);
  let slug = "";
  try {
    slug = decodeURIComponent(segments[2] || "").trim();
  } catch {
    return notFound("Public site not found", PUBLIC_CACHE_HEADERS);
  }
  if (!slug) return notFound("Public site not found", PUBLIC_CACHE_HEADERS);

  const site = await env.DB.prepare(
    "SELECT id,name,domain FROM sites WHERE public_enabled=1 AND public_slug=? LIMIT 1",
  )
    .bind(slug)
    .first<SiteRow>();
  return site ?? notFound("Public site not found", PUBLIC_CACHE_HEADERS);
}
