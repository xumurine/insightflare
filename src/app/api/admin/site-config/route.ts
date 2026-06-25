import { bad, jsonResponseFor } from "@/lib/edge/admin-response";
import { requireSameOrigin } from "@/lib/edge/utils";
import { upsertAdminSiteConfig } from "@/lib/edge-client";
import {
  assertContentSize,
  BODY_SIZE_LIMITS,
  bodyStr,
  parseFormBool,
  parseRequestBody,
} from "@/lib/form-helpers";
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
  // Body 大小限制检查
  const sizeError = assertContentSize(request, BODY_SIZE_LIMITS.ADMIN_API);
  if (sizeError) return sizeError;

  // CSRF 保护：验证 Origin/Referer
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;

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
