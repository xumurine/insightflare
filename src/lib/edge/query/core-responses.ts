import {
  PRIVATE_CACHE_HEADERS,
  PUBLIC_CACHE_HEADERS,
  PUBLIC_PRIVACY,
  type SiteQueryResponseOptions,
} from "./core-types";

export const jsonResponse = (
  payload: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(extraHeaders ?? {}),
    },
  });

export const badRequest = (
  message: string,
  extraHeaders?: Record<string, string>,
) => jsonResponse({ ok: false, error: message }, 400, extraHeaders);
export const unauthorized = (
  message = "Unauthorized",
  extraHeaders?: Record<string, string>,
) => jsonResponse({ ok: false, error: message }, 401, extraHeaders);
export const notFound = (
  message = "Not Found",
  extraHeaders?: Record<string, string>,
) => jsonResponse({ ok: false, error: message }, 404, extraHeaders);
export const notAllowed = (extraHeaders?: Record<string, string>) =>
  jsonResponse({ ok: false, error: "Method Not Allowed" }, 405, extraHeaders);

export function siteQueryHeaders(
  options: SiteQueryResponseOptions,
): Record<string, string> {
  return options.publicSite ? PUBLIC_CACHE_HEADERS : PRIVATE_CACHE_HEADERS;
}

export function siteQueryResponse(
  siteId: string,
  payload: Record<string, unknown>,
  options: SiteQueryResponseOptions = {},
): Response {
  const body = options.publicSite
    ? { ...payload, site: options.publicSite, privacy: PUBLIC_PRIVACY }
    : { ...payload, siteId };
  return jsonResponse(body, 200, siteQueryHeaders(options));
}
