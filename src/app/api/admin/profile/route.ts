import { NextResponse } from "next/server";

import { updateMyProfile } from "@/lib/edge-client";
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

  try {
    const hasTimeZone = Object.prototype.hasOwnProperty.call(body, "timeZone");
    const hasName = Object.prototype.hasOwnProperty.call(body, "name");
    const result = await updateMyProfile({
      username: bodyStr(body, "username") || undefined,
      email: bodyStr(body, "email") || undefined,
      name: hasName ? bodyStr(body, "name") : undefined,
      currentPassword: bodyStr(body, "currentPassword") || undefined,
      password: bodyStr(body, "password") || undefined,
      ...(hasTimeZone ? { timeZone: bodyStr(body, "timeZone") } : {}),
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const msg = normalizeErrorMessage(error);
    return NextResponse.json(
      { ok: false, error: "profile_update_failed", message: msg },
      { status: 500 },
    );
  }
}
