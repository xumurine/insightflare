import { isBot } from "ua-parser-js/bot-detection";

import { normalizeTrackerUaClientHints } from "@/lib/edge/client-hints";
import { resolveEdgeRuntime } from "@/lib/edge/runtime";
import {
  normalizeSiteSettingsKey,
  readSiteTrackingConfig,
} from "@/lib/edge/site-settings-store";
import type {
  IngestEnvelopePayload,
  SerializedRequestPayload,
  TrackerClientPayload,
} from "@/lib/edge/types";
import type { TrackerPayloadKind } from "@/lib/edge/types";
import { jsonCloneRecord } from "@/lib/edge/utils";
import type { SiteTrackingConfig } from "@/lib/site-settings";

const CORS_BASE_HEADERS = {
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "86400",
};

const SUPPORTED_KINDS = new Set<TrackerPayloadKind>([
  "pageview",
  "leave",
  "custom_event",
]);
const MAX_EVENT_DATA_JSON_LENGTH = 4000;

function pickSiteIdFromPayload(
  payload: TrackerClientPayload,
  requestUrl: URL,
): string {
  if (typeof payload.siteId === "string" && payload.siteId.length > 0) {
    return payload.siteId;
  }
  const fromQuery = requestUrl.searchParams.get("siteId");
  if (fromQuery && fromQuery.length > 0) {
    return fromQuery;
  }
  return "default";
}

function sanitizeInputPayload(payload: unknown): TrackerClientPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as TrackerClientPayload;
}

function coerceTrimmedString(input: unknown, maxLength: number): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, maxLength);
}

function isSupportedKind(input: unknown): input is TrackerPayloadKind {
  return (
    typeof input === "string" &&
    SUPPORTED_KINDS.has(input as TrackerPayloadKind)
  );
}

function validateEventData(input: unknown): string | null {
  try {
    const serialized = JSON.stringify(input ?? null);
    if (serialized.length > MAX_EVENT_DATA_JSON_LENGTH) {
      return "eventData is too large";
    }
    return null;
  } catch {
    return "eventData must be JSON serializable";
  }
}

function normalizeClientHostname(input: unknown): string {
  const value = coerceTrimmedString(input, 255)
    .toLowerCase()
    .replace(/\.+$/, "");
  if (!value || value.includes("/") || value.includes(":")) return "";
  return value;
}

function normalizePayloadPathname(input: unknown): string {
  let value = coerceTrimmedString(input, 4096);
  if (!value) value = "/";

  if (value.includes("://")) {
    try {
      value = new URL(value).pathname || "/";
    } catch {
      return "";
    }
  }

  value = value.split(/[?#]/)[0] ?? value;
  value = value.trim().replace(/\s+/g, "");
  if (!value) value = "/";
  if (!value.startsWith("/")) value = `/${value.replace(/^\/+/, "")}`;
  value = value.replace(/\/{2,}/g, "/");
  return value.slice(0, 2048);
}

function matchesBlockedPath(pathname: string, blockedPaths: string[]): boolean {
  for (const blockedPath of blockedPaths) {
    if (!blockedPath) continue;
    if (pathname === blockedPath || pathname.startsWith(`${blockedPath}/`)) {
      return true;
    }
  }
  return false;
}

function serializeHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

function serializeRequestPayload(
  request: Request,
  body: string,
): SerializedRequestPayload {
  return {
    method: request.method,
    url: request.url,
    headers: serializeHeaders(request),
    cf: jsonCloneRecord((request as Request & { cf?: unknown }).cf),
    body,
    receivedAt: Date.now(),
  };
}

function parseOrigin(request: Request): string | null {
  const raw = (request.headers.get("origin") || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function parseOriginHostname(origin: string | null): string {
  if (!origin) return "";
  try {
    return new URL(origin).hostname.trim().toLowerCase().replace(/\.+$/, "");
  } catch {
    return "";
  }
}

function toCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin) {
    return {
      ...CORS_BASE_HEADERS,
      vary: "Origin",
    };
  }
  return {
    ...CORS_BASE_HEADERS,
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    vary: "Origin",
  };
}

function isBotRequest(request: Request): boolean {
  const ua = request.headers.get("user-agent") || "";
  if (!ua || !isBot(ua)) return false;
  console.log(`[Bot] UA: ${ua}`);
  return true;
}

type CollectionDecision =
  | {
      shouldForward: false;
      allowOrigin: string | null;
      siteId: string;
      payload: null;
    }
  | {
      shouldForward: true;
      allowOrigin: string | null;
      siteId: string;
      payload: TrackerClientPayload;
    };

async function decideCollectionPolicy(
  request: Request,
  env: Awaited<ReturnType<typeof resolveEdgeRuntime>>["env"],
  payload: TrackerClientPayload | null,
  requestUrl: URL,
): Promise<CollectionDecision> {
  const origin = parseOrigin(request);
  const originHostname = parseOriginHostname(origin);
  if (!payload) {
    return {
      shouldForward: false,
      allowOrigin: origin,
      siteId: "",
      payload: null,
    };
  }

  const kind = payload.kind;
  if (!isSupportedKind(kind)) {
    return {
      shouldForward: false,
      allowOrigin: origin,
      siteId: "",
      payload: null,
    };
  }

  const siteId = normalizeSiteSettingsKey(
    pickSiteIdFromPayload(payload, requestUrl),
  );
  if (!siteId) {
    return {
      shouldForward: false,
      allowOrigin: origin,
      siteId: "",
      payload: null,
    };
  }

  let settings = null;
  try {
    // `readSiteTrackingConfig` already caches KV results for 1 hour.
    settings = await readSiteTrackingConfig(env, siteId);
  } catch {
    settings = null;
  }

  if (!settings?.siteDomain) {
    return {
      shouldForward: false,
      allowOrigin: origin,
      siteId,
      payload: null,
    };
  }

  const hasWhitelist =
    Array.isArray(settings.domainWhitelist) &&
    settings.domainWhitelist.length > 0;
  if (
    hasWhitelist &&
    !settings.allowedHostnames.some(
      (hostname) => hostname.trim().toLowerCase() === originHostname,
    )
  ) {
    return {
      shouldForward: false,
      allowOrigin: origin,
      siteId,
      payload: null,
    };
  }

  const normalizedPayload = normalizeForwardPayload(
    payload,
    siteId,
    kind,
    settings,
  );
  if (!normalizedPayload) {
    return {
      shouldForward: false,
      allowOrigin: origin,
      siteId,
      payload: null,
    };
  }

  return {
    shouldForward: true,
    allowOrigin: origin,
    siteId,
    payload: normalizedPayload,
  };
}

function normalizeForwardPayload(
  payload: TrackerClientPayload,
  siteId: string,
  kind: TrackerPayloadKind,
  settings: SiteTrackingConfig,
): TrackerClientPayload | null {
  const visitId = coerceTrimmedString(payload.visitId, 128);
  if (!visitId) return null;

  const normalizedPayload: TrackerClientPayload = {
    ...payload,
    siteId,
    kind,
    visitId,
  };
  const uaClientHints = normalizeTrackerUaClientHints(payload.uaClientHints);
  if (uaClientHints) {
    normalizedPayload.uaClientHints = uaClientHints;
  } else {
    delete normalizedPayload.uaClientHints;
  }

  const canCheckPath =
    kind === "pageview" ||
    kind === "custom_event" ||
    (kind === "leave" &&
      coerceTrimmedString(payload.pathname, 4096).length > 0);

  if (canCheckPath) {
    const pathname = normalizePayloadPathname(payload.pathname);
    if (!pathname || matchesBlockedPath(pathname, settings.pathBlacklist)) {
      return null;
    }
    normalizedPayload.pathname = pathname;
  }

  if (kind === "pageview") {
    const hostname = normalizeClientHostname(payload.hostname);
    if (!hostname) return null;
    normalizedPayload.hostname = hostname;
  }

  if (kind === "custom_event") {
    const eventName = coerceTrimmedString(payload.eventName, 120);
    if (!eventName) return null;
    normalizedPayload.eventName = eventName;
  }

  return normalizedPayload;
}

function noContent(origin: string | null): Response {
  return new Response(null, { status: 204, headers: toCorsHeaders(origin) });
}

function badRequest(origin: string | null, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 400,
    headers: {
      ...toCorsHeaders(origin),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function OPTIONS(request: Request): Promise<Response> {
  return noContent(parseOrigin(request));
}

export async function POST(request: Request): Promise<Response> {
  const {
    env,
    ctx,
    request: requestWithCf,
    url,
  } = await resolveEdgeRuntime(request);
  const origin = parseOrigin(requestWithCf);

  if (isBotRequest(requestWithCf)) {
    return noContent(origin);
  }

  const body = await requestWithCf.text();
  let payload: TrackerClientPayload | null = null;
  if (body) {
    try {
      payload = sanitizeInputPayload(JSON.parse(body));
    } catch {
      return badRequest(origin, "Invalid JSON payload");
    }
  }

  if (payload?.kind === "custom_event") {
    const eventDataError = validateEventData(payload.eventData);
    if (eventDataError) {
      return badRequest(origin, eventDataError);
    }
  }

  const decision = await decideCollectionPolicy(
    requestWithCf,
    env,
    payload,
    url,
  );
  if (!decision.shouldForward) {
    return noContent(decision.allowOrigin);
  }

  const doId = env.INGEST_DO.idFromName(decision.siteId);
  const stub = env.INGEST_DO.get(doId);

  const envelope: IngestEnvelopePayload = {
    request: serializeRequestPayload(requestWithCf, body),
    client: decision.payload,
  };

  ctx.waitUntil(
    stub
      .fetch("https://ingest.internal/ingest", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(envelope),
      })
      .catch((error: unknown) => {
        console.error("forward_to_do_failed", error);
      }),
  );

  return noContent(decision.allowOrigin);
}
