import { describe, expect, it } from "vitest";

import { shouldUseHono } from "@/lib/hono/path-match";

describe("shouldUseHono", () => {
  it.each([
    "/api",
    "/api/private/overview",
    "/api/public/share/demo/site",
    "/api/v1/capabilities",
    "/api/public/resources/map-tiles/1/0/0.png",
    "/api/public/resources/world-countries",
    "/collect",
    "/script.js",
    "/healthz",
    "/notification-email-preview",
    "/.well-known/openapi.json",
    "/.well-known/security.txt",
    "/api/private/realtime/ws",
    "/api/private/realtime/ws/extra",
  ])("routes %s through the Hono app", (pathname) => {
    expect(shouldUseHono(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/app",
    "/login",
    "/zh/app/team/site",
    "/_next/static/chunk.js",
    "/favicon.ico",
    "/collect/",
  ])("leaves %s on the OpenNext path", (pathname) => {
    expect(shouldUseHono(pathname)).toBe(false);
  });
});
