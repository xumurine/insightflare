import { toTeamRole } from "@/lib/dashboard/permissions";
import { bad, jsonResponseFor } from "@/lib/edge/admin-response";
import {
  addAdminMember,
  removeAdminMember,
  updateAdminMemberRole,
} from "@/lib/edge-client";
import { bodyStr, parseRequestBody } from "@/lib/form-helpers";
import { errorResponse, normalizeErrorMessage } from "@/lib/response";

export async function POST(request: Request): Promise<Response> {
  const body = await parseRequestBody(request);
  const intent = bodyStr(body, "intent") || "add";

  const teamId = bodyStr(body, "teamId");
  if (intent === "remove") {
    const userId = bodyStr(body, "userId");
    if (teamId.length === 0 || userId.length === 0) {
      return bad(
        "Invalid member remove input",
        "invalid_member_remove_input",
        request,
      );
    }

    try {
      const result = await removeAdminMember({ teamId, userId });
      return jsonResponseFor(request, { ok: true, data: result });
    } catch (error) {
      const msg = normalizeErrorMessage(error);
      return errorResponse(request, 500, "remove_member_failed", msg);
    }
  }

  if (intent === "update_role") {
    const userId = bodyStr(body, "userId");
    const role = toTeamRole(bodyStr(body, "role"));
    if (teamId.length === 0 || userId.length === 0 || role === "owner") {
      return bad(
        "Invalid member role input",
        "invalid_member_role_input",
        request,
      );
    }
    try {
      const result = await updateAdminMemberRole({ teamId, userId, role });
      return jsonResponseFor(request, { ok: true, data: result });
    } catch (error) {
      const msg = normalizeErrorMessage(error);
      return errorResponse(request, 500, "update_member_role_failed", msg);
    }
  }

  const identifier = bodyStr(body, "identifier");
  if (teamId.length === 0 || identifier.length < 2) {
    return bad("Invalid member input", "invalid_member_input", request);
  }

  const requestedRoleRaw = bodyStr(body, "role");
  const requestedRole = requestedRoleRaw ? toTeamRole(requestedRoleRaw) : null;
  if (requestedRole === "owner") {
    return bad("Cannot assign owner role", "invalid_member_input", request);
  }

  try {
    const result = await addAdminMember(
      requestedRole
        ? { teamId, identifier, role: requestedRole }
        : { teamId, identifier },
    );
    return jsonResponseFor(request, { ok: true, data: result });
  } catch (error) {
    const msg = normalizeErrorMessage(error);
    return errorResponse(request, 500, "add_member_failed", msg);
  }
}
