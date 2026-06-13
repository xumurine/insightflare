import { handlePrivateAdmin } from "@/lib/edge/admin";
import { handlePrivateArchive } from "@/lib/edge/archive-query";
import { handlePrivateQuery } from "@/lib/edge/query";
import { resolveEdgeRuntime } from "@/lib/edge/runtime";
import type { Env } from "@/lib/edge/types";

function routePrivateRequest(
  request: Request,
  env: Env,
  url: URL,
  ctx: ExecutionContext,
): Promise<Response> {
  if (url.pathname.startsWith("/api/private/admin/")) {
    return handlePrivateAdmin(request, env, url);
  }
  if (url.pathname.startsWith("/api/private/archive/")) {
    return handlePrivateArchive(request, env, url);
  }
  return handlePrivateQuery(request, env, url, ctx);
}

export async function GET(request: Request): Promise<Response> {
  const {
    request: requestWithCf,
    env,
    ctx,
    url,
  } = await resolveEdgeRuntime(request);
  return routePrivateRequest(requestWithCf, env, url, ctx);
}

export async function POST(request: Request): Promise<Response> {
  const {
    request: requestWithCf,
    env,
    ctx,
    url,
  } = await resolveEdgeRuntime(request);
  return routePrivateRequest(requestWithCf, env, url, ctx);
}

export async function PATCH(request: Request): Promise<Response> {
  const {
    request: requestWithCf,
    env,
    ctx,
    url,
  } = await resolveEdgeRuntime(request);
  return routePrivateRequest(requestWithCf, env, url, ctx);
}

export async function DELETE(request: Request): Promise<Response> {
  const {
    request: requestWithCf,
    env,
    ctx,
    url,
  } = await resolveEdgeRuntime(request);
  return routePrivateRequest(requestWithCf, env, url, ctx);
}
