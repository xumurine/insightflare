import { SESSION_COOKIE, SESSION_DURATION_SECONDS } from "@/lib/constants";
import { loginAdminAccount } from "@/lib/edge-client";
import { bodyStr, parseRequestBody } from "@/lib/form-helpers";
import { bad, errorResponse, jsonResponseFor, una } from "@/lib/response";
import { createSessionToken } from "@/lib/session";

export async function POST(request: Request): Promise<Response> {
  const body = await parseRequestBody(request);
  const username = bodyStr(body, "username");
  const password = String(body.password ?? "");
  const nextPathRaw = bodyStr(body, "next") || "/app";
  const nextPathClean = nextPathRaw.split("?")[0].replace(/\/+$/, "");
  const isUnsafe =
    !nextPathRaw.startsWith("/") ||
    nextPathRaw.startsWith("//") ||
    nextPathClean === "/login" ||
    nextPathClean.endsWith("/login");
  const nextPath = isUnsafe ? "/app" : nextPathRaw;

  if (username.length < 2 || password.length < 1) {
    return bad("Invalid credentials", "invalid_credentials", request);
  }

  try {
    const loginData = await loginAdminAccount({ username, password });
    const token = await createSessionToken(
      {
        userId: loginData.user.id,
        username: loginData.user.username,
        displayName: loginData.user.name || loginData.user.username,
        systemRole: loginData.user.systemRole,
      },
      SESSION_DURATION_SECONDS,
    );

    const cookieParts = [
      `${SESSION_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${SESSION_DURATION_SECONDS}`,
    ];
    if (process.env.NODE_ENV === "production") {
      cookieParts.push("Secure");
    }

    const response = jsonResponseFor(request, {
      ok: true,
      data: { next: nextPath },
    });
    response.headers.set("set-cookie", cookieParts.join("; "));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusMatch = message.match(/Edge API failed \((\d{3})\b/);
    const upstreamStatus = statusMatch ? Number(statusMatch[1]) : 0;

    if (upstreamStatus === 401) {
      return una("Invalid credentials", "invalid_credentials", request);
    }

    console.error("login_upstream_failed", { message });
    return errorResponse(
      request,
      upstreamStatus >= 400 ? upstreamStatus : 502,
      "login_upstream_failed",
      message,
    );
  }
}
