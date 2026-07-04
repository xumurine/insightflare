import type { ResponseContext } from "@/lib/response";

import {
  PRIVATE_CACHE_HEADERS,
  PUBLIC_CACHE_HEADERS,
  PUBLIC_PRIVACY,
  type SiteQueryResponseOptions,
} from "./core-types";

export type { ResponseContext } from "@/lib/response";
export {
  bad as badRequest,
  forb,
  getRequestId,
  j as jsonResponse,
  jsonResponseWith,
  na as notAllowed,
  nf as notFound,
  una as unauthorized,
} from "@/lib/response";

export function siteQueryHeaders(
  options: SiteQueryResponseOptions,
): Record<string, string> {
  return options.publicSite ? PUBLIC_CACHE_HEADERS : PRIVATE_CACHE_HEADERS;
}

export function siteQueryResponse(
  siteId: string,
  payload: Record<string, unknown>,
  options: SiteQueryResponseOptions = {},
  ctx?: ResponseContext,
): Response {
  const base: Record<string, unknown> = options.publicSite
    ? { ...payload, site: options.publicSite, privacy: PUBLIC_PRIVACY }
    : { ...payload, siteId };
  const body = ctx
    ? { ...base, requestId: ctx.requestId, timestamp: new Date().toISOString() }
    : base;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...siteQueryHeaders(options),
    },
  });
}
