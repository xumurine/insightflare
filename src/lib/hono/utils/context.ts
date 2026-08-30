import type { Context } from "hono";

import type { AppEnv } from "@/lib/hono/types";

export function executionContext(c: Context<AppEnv>): ExecutionContext {
  return c.executionCtx as unknown as ExecutionContext;
}

export function requestUrl(c: Context<AppEnv>): URL {
  const existing = c.get("requestUrl");
  if (existing) return existing;
  const url = new URL(c.req.raw.url);
  c.set("requestUrl", url);
  return url;
}

export function responseContext(c: Context<AppEnv>): { requestId: string } {
  return { requestId: c.get("requestId") };
}
