import { bad, jsonResponseFor } from "@/lib/edge/admin-response";
import { upsertAdminSiteConfig } from "@/lib/edge-client";
import { bodyStr, parseFormBool, parseRequestBody } from "@/lib/form-helpers";
import { errorResponse, normalizeErrorMessage } from "@/lib/response";

function buildLegacyConfig(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    privacy: {
      maskQueryHashDetails: parseFormBool(body.maskQueryHashDetails, true),
      maskVisitorTrajectory: parseFormBool(body.maskVisitorTrajectory, true),
      maskDetailedReferrerUrl: parseFormBool(
        body.maskDetailedReferrerUrl,
        true,
      ),
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  const body = await parseRequestBody(request);
  const siteId = bodyStr(body, "siteId");

  if (siteId.length === 0) {
    return bad("Missing site ID", "missing_site_id", request);
  }

  const config =
    body.config && typeof body.config === "object"
      ? (body.config as Record<string, unknown>)
      : buildLegacyConfig(body);

  try {
    const saved = await upsertAdminSiteConfig({
      siteId,
      config,
    });
    return jsonResponseFor(request, { ok: true, data: saved });
  } catch (error) {
    const msg = normalizeErrorMessage(error);
    return errorResponse(request, 500, "save_site_config_failed", msg);
  }
}
