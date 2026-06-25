import { bad, jsonResponseFor } from "@/lib/edge/admin-response";
import { requireSameOrigin } from "@/lib/edge/utils";
import {
  createAdminTeam,
  removeAdminTeam,
  transferAdminTeamOwner,
  updateAdminTeam,
} from "@/lib/edge-client";
import {
  assertContentSize,
  BODY_SIZE_LIMITS,
  bodyStr,
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
  const intent = bodyStr(body, "intent");

  const teamId = bodyStr(body, "teamId");
  const name = bodyStr(body, "name");
  const slug = bodyStr(body, "slug");

  if (intent === "transfer_owner") {
    const newOwnerUserId = bodyStr(body, "newOwnerUserId");
    if (teamId.length === 0 || newOwnerUserId.length === 0) {
      return bad("Missing transfer input", "missing_transfer_input", request);
    }

    try {
      const result = await transferAdminTeamOwner({ teamId, newOwnerUserId });
      return jsonResponseFor(request, { ok: true, data: result });
    } catch (error) {
      const msg = normalizeErrorMessage(error);
      return errorResponse(request, 500, "transfer_team_failed", msg);
    }
  }

  if (intent === "remove" || intent === "delete") {
    if (teamId.length === 0) {
      return bad("Missing team ID", "missing_team_id", request);
    }

    try {
      const result = await removeAdminTeam({ teamId });
      return jsonResponseFor(request, { ok: true, data: result });
    } catch (error) {
      const msg = normalizeErrorMessage(error);
      return errorResponse(request, 500, "remove_team_failed", msg);
    }
  }

  if (name.length < 2) {
    return bad("Invalid team name", "invalid_team_name", request);
  }

  if (teamId.length > 0) {
    try {
      const updated = await updateAdminTeam({
        teamId,
        name,
        slug: slug || undefined,
      });
      return jsonResponseFor(request, { ok: true, data: updated });
    } catch (error) {
      const msg = normalizeErrorMessage(error);
      return errorResponse(request, 500, "update_team_failed", msg);
    }
  }

  try {
    const created = await createAdminTeam({
      name,
      slug: slug || undefined,
    });
    return jsonResponseFor(request, { ok: true, data: created });
  } catch (error) {
    const msg = normalizeErrorMessage(error);
    return errorResponse(request, 500, "create_team_failed", msg);
  }
}
