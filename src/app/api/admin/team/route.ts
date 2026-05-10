import { NextResponse } from "next/server";

import {
  createAdminTeam,
  removeAdminTeam,
  transferAdminTeamOwner,
  updateAdminTeam,
} from "@/lib/edge-client";
import { bodyStr, parseRequestBody } from "@/lib/form-helpers";

function normalizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const jsonStart = raw.lastIndexOf("{");
  if (jsonStart >= 0) {
    const maybeJson = raw.slice(jsonStart).trim();
    try {
      const parsed = JSON.parse(maybeJson) as {
        message?: unknown;
        error?: unknown;
      };
      if (typeof parsed.message === "string" && parsed.message.trim())
        return parsed.message.trim();
      if (typeof parsed.error === "string" && parsed.error.trim())
        return parsed.error.trim();
    } catch {
      // fall through to raw
    }
  }
  return raw;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await parseRequestBody(request);
  const intent = bodyStr(body, "intent");

  const teamId = bodyStr(body, "teamId");
  const name = bodyStr(body, "name");
  const slug = bodyStr(body, "slug");

  if (intent === "transfer_owner") {
    const newOwnerUserId = bodyStr(body, "newOwnerUserId");
    if (teamId.length === 0 || newOwnerUserId.length === 0) {
      return NextResponse.json(
        { ok: false, error: "missing_transfer_input" },
        { status: 400 },
      );
    }

    try {
      const result = await transferAdminTeamOwner({ teamId, newOwnerUserId });
      return NextResponse.json({ ok: true, data: result });
    } catch (error) {
      const msg = normalizeErrorMessage(error);
      return NextResponse.json(
        { ok: false, error: "transfer_team_failed", message: msg },
        { status: 500 },
      );
    }
  }

  if (intent === "remove" || intent === "delete") {
    if (teamId.length === 0) {
      return NextResponse.json(
        { ok: false, error: "missing_team_id" },
        { status: 400 },
      );
    }

    try {
      const result = await removeAdminTeam({ teamId });
      return NextResponse.json({ ok: true, data: result });
    } catch (error) {
      const msg = normalizeErrorMessage(error);
      return NextResponse.json(
        { ok: false, error: "remove_team_failed", message: msg },
        { status: 500 },
      );
    }
  }

  if (name.length < 2) {
    return NextResponse.json(
      { ok: false, error: "invalid_team_name" },
      { status: 400 },
    );
  }

  if (teamId.length > 0) {
    try {
      const updated = await updateAdminTeam({
        teamId,
        name,
        slug: slug || undefined,
      });
      return NextResponse.json({ ok: true, data: updated });
    } catch (error) {
      const msg = normalizeErrorMessage(error);
      return NextResponse.json(
        { ok: false, error: "update_team_failed", message: msg },
        { status: 500 },
      );
    }
  }

  try {
    const created = await createAdminTeam({
      name,
      slug: slug || undefined,
    });
    return NextResponse.json({ ok: true, data: created });
  } catch (error) {
    const msg = normalizeErrorMessage(error);
    return NextResponse.json(
      { ok: false, error: "create_team_failed", message: msg },
      { status: 500 },
    );
  }
}
