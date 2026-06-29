import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "@/lib/hono/types";

export const API_NO_CACHE_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate",
  pragma: "no-cache",
};

export function apiNoCacheMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    if (!c.req.path.startsWith("/api")) return;
    for (const [key, value] of Object.entries(API_NO_CACHE_HEADERS)) {
      c.res.headers.set(key, value);
    }
  };
}
