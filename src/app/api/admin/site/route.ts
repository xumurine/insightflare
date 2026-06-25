import { bad, jsonResponseFor } from "@/lib/edge/admin-response";
import { requireSameOrigin } from "@/lib/edge/utils";
import {
  createAdminSite,
  removeAdminSite,
  updateAdminSite,
} from "@/lib/edge-client";
import {
  assertContentSize,
  BODY_SIZE_LIMITS,
  bodyStr,
  parseFormBool,
  parseRequestBody,
} from "@/lib/form-helpers";
import { errorResponse, normalizeErrorMessage } from "@/lib/response";

export async function POST(request: Request): Promise<Response> {
  // Body 大小限制检查
  const sizeError = assertContentSize(request, BODY_SIZE_LIMITS.ADMIN_API);
  if (sizeError) return sizeError;

  // CSRF 保护：验证 Origin/Referer
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;

  const body = await parseRequestBody(request);
  const intent = bodyStr(body, "intent") || "create";

  const teamId = bodyStr(body, "teamId");
  const siteId = bodyStr(body, "siteId");
  const name = bodyStr(body, "name");
  const domain = bodyStr(body, "domain");
  const publicEnabled = parseFormBool(body.publicEnabled);
  const publicSlug = bodyStr(body, "publicSlug");

  try {
    if (intent === "remove") {
      if (siteId.length === 0) {
        return bad("Missing site ID", "missing_site_id", request);
      }
      const removed = await removeAdminSite({ siteId });
      return jsonResponseFor(request, { ok: true, data: removed });
    } else if (intent === "update") {
      if (siteId.length === 0) {
        return bad("Missing site ID", "missing_site_id", request);
      }
      const updated = await updateAdminSite({
        siteId,
        teamId: teamId || undefined,
        name: name || undefined,
        domain: domain || undefined,
        publicEnabled,
        publicSlug: publicSlug || undefined,
      });
      return jsonResponseFor(request, { ok: true, data: updated });
    } else {
      if (teamId.length === 0 || name.length === 0 || domain.length === 0) {
        return bad("Invalid site input", "invalid_site_input", request);
      }
      const created = await createAdminSite({
        teamId,
        name,
        domain,
        publicEnabled,
        publicSlug: publicSlug || undefined,
      });
      return jsonResponseFor(request, { ok: true, data: created });
    }
  } catch (error) {
    const msg = normalizeErrorMessage(error);
    return errorResponse(request, 500, "site_mutation_failed", msg);
  }
}
