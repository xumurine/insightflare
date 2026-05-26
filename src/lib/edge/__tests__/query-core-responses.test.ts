import { describe, expect, it } from "vitest";

import {
  badRequest,
  jsonResponse,
  notAllowed,
  notFound,
  siteQueryHeaders,
  siteQueryResponse,
  unauthorized,
} from "@/lib/edge/query/core-responses";
import {
  PRIVATE_CACHE_HEADERS,
  PUBLIC_CACHE_HEADERS,
  PUBLIC_PRIVACY,
} from "@/lib/edge/query/core-types";

describe("edge query response helpers", () => {
  it("serializes JSON responses with status and extra headers", async () => {
    const response = jsonResponse({ ok: true }, 202, {
      "cache-control": "no-store",
    });

    expect(response.status).toBe(202);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("builds standard error responses with optional messages", async () => {
    await expect(badRequest("Invalid").json()).resolves.toEqual({
      ok: false,
      error: "Invalid",
    });
    await expect(unauthorized().json()).resolves.toEqual({
      ok: false,
      error: "Unauthorized",
    });
    await expect(notFound("Missing").json()).resolves.toEqual({
      ok: false,
      error: "Missing",
    });

    const notAllowedResponse = notAllowed({ allow: "GET" });
    expect(notAllowedResponse.status).toBe(405);
    expect(notAllowedResponse.headers.get("allow")).toBe("GET");
    await expect(notAllowedResponse.json()).resolves.toEqual({
      ok: false,
      error: "Method Not Allowed",
    });
  });

  it("selects private and public site query cache headers", () => {
    expect(siteQueryHeaders({})).toBe(PRIVATE_CACHE_HEADERS);
    expect(
      siteQueryHeaders({
        publicSite: { slug: "public", name: "Public", domain: "example.com" },
      }),
    ).toBe(PUBLIC_CACHE_HEADERS);
  });

  it("wraps private responses with site id and public responses with privacy", async () => {
    const privateResponse = siteQueryResponse("site-1", { ok: true });
    const publicResponse = siteQueryResponse(
      "site-1",
      { ok: true, siteId: "ignored" },
      {
        publicSite: {
          slug: "public",
          name: "Public",
          domain: "public.example",
        },
      },
    );

    expect(privateResponse.headers.get("cache-control")).toBe(
      PRIVATE_CACHE_HEADERS["cache-control"],
    );
    await expect(privateResponse.json()).resolves.toEqual({
      ok: true,
      siteId: "site-1",
    });
    expect(publicResponse.headers.get("access-control-allow-origin")).toBe("*");
    await expect(publicResponse.json()).resolves.toEqual({
      ok: true,
      siteId: "ignored",
      site: { slug: "public", name: "Public", domain: "public.example" },
      privacy: PUBLIC_PRIVACY,
    });
  });
});
