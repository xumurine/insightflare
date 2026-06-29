import { createMiddleware } from "hono/factory";
import { isBot } from "ua-parser-js/bot-detection";

import type { AppEnv } from "@/lib/hono/types";

type FetchMetadataResult = "pass" | "fail" | "missing";

interface PublicApiGateOptions {
  allowImageDest?: boolean;
  methods?: ReadonlyArray<string>;
}

const DEFAULT_PUBLIC_METHODS = ["GET", "HEAD", "OPTIONS"] as const;
const BLOCKED_UA_FRAGMENTS = [
  "curl",
  "wget",
  "python-requests",
  "python-httpx",
  "aiohttp",
  "httpclient",
  "go-http-client",
  "okhttp",
  "java/",
  "libwww",
  "scrapy",
] as const;

function forbidden() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

export function getTargetOrigin(req: Request): string | null {
  try {
    return new URL(req.url).origin;
  } catch {
    return null;
  }
}

function normalizeMethods(methods?: ReadonlyArray<string>): Set<string> {
  return new Set(
    (methods || DEFAULT_PUBLIC_METHODS).map((m) => m.toUpperCase()),
  );
}

export function isBadSimpleUA(req: Request): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua) return true;
  if (ua.length > 512) return true;
  const lower = ua.toLowerCase();
  return BLOCKED_UA_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

export function checkFetchMetadata(
  req: Request,
  options: Pick<PublicApiGateOptions, "allowImageDest"> = {},
): FetchMetadataResult {
  const site = req.headers.get("sec-fetch-site");
  const mode = req.headers.get("sec-fetch-mode");
  const dest = req.headers.get("sec-fetch-dest");
  if (!site) return "missing";
  if (site !== "same-origin") return "fail";

  const allowedDest = new Set(["empty"]);
  if (options.allowImageDest) allowedDest.add("image");
  if (dest && !allowedDest.has(dest)) return "fail";

  const allowedMode = new Set(["cors", "same-origin"]);
  if (options.allowImageDest) allowedMode.add("no-cors");
  if (mode && !allowedMode.has(mode)) return "fail";
  return "pass";
}

export function getRefererOrigin(req: Request): string | null {
  const referer = req.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function checkOriginOrReferer(req: Request): boolean {
  const targetOrigin = getTargetOrigin(req);
  if (!targetOrigin) return false;
  const origin = req.headers.get("origin");
  if (origin) return origin === targetOrigin;
  return getRefererOrigin(req) === targetOrigin;
}

export function isBotByUAParser(req: Request): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua) return true;
  if (ua.length > 512) return true;
  return isBot(ua);
}

function publicPreflight(req: Request): Response {
  const targetOrigin = getTargetOrigin(req);
  const origin = req.headers.get("origin");
  if (!targetOrigin || origin !== targetOrigin) return forbidden();
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": targetOrigin,
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-allow-headers": "Content-Type, X-Requested-With",
      "access-control-max-age": "600",
      vary: "Origin",
    },
  });
}

export function publicApiGate(options: PublicApiGateOptions = {}) {
  const allowedMethods = normalizeMethods(options.methods);
  return createMiddleware<AppEnv>(async (c, next) => {
    const req = c.req.raw;
    const method = req.method.toUpperCase();
    if (!allowedMethods.has(method)) return forbidden();
    if (method === "OPTIONS") return publicPreflight(req);
    if (isBadSimpleUA(req)) return forbidden();

    const fetchMetadataResult = checkFetchMetadata(req, options);
    if (fetchMetadataResult === "fail") return forbidden();
    if (fetchMetadataResult === "missing" && !checkOriginOrReferer(req)) {
      return forbidden();
    }
    if (isBotByUAParser(req)) return forbidden();

    await next();
  });
}
