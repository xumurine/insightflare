import { resolveEdgeRuntime } from "@/lib/edge/runtime";
import { handleTrackerScriptRequest } from "@/lib/edge/script-endpoint";

export async function GET(request: Request): Promise<Response> {
  const { env, request: requestWithCf } = await resolveEdgeRuntime(request);
  return handleTrackerScriptRequest(requestWithCf, env);
}
