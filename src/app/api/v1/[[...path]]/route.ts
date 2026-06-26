import { handleApiV1 } from "@/lib/edge/api-v1";
import { resolveEdgeRuntime } from "@/lib/edge/runtime";

async function routeApiV1Request(request: Request): Promise<Response> {
  const {
    request: requestWithCf,
    env,
    ctx,
    url,
  } = await resolveEdgeRuntime(request);
  return handleApiV1(requestWithCf, env, url, ctx);
}

export async function GET(request: Request): Promise<Response> {
  return routeApiV1Request(request);
}

export async function POST(request: Request): Promise<Response> {
  return routeApiV1Request(request);
}

export async function PATCH(request: Request): Promise<Response> {
  return routeApiV1Request(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return routeApiV1Request(request);
}
