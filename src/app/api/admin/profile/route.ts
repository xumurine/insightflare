import { jsonResponseFor } from "@/lib/edge/admin-response";
import { requireSameOrigin } from "@/lib/edge/utils";
import { updateMyProfile } from "@/lib/edge-client";
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

  try {
    const hasTimeZone = Object.prototype.hasOwnProperty.call(body, "timeZone");
    const hasName = Object.prototype.hasOwnProperty.call(body, "name");
    const result = await updateMyProfile({
      username: bodyStr(body, "username") || undefined,
      email: bodyStr(body, "email") || undefined,
      name: hasName ? bodyStr(body, "name") : undefined,
      currentPassword: bodyStr(body, "currentPassword") || undefined,
      password: bodyStr(body, "password") || undefined,
      ...(hasTimeZone ? { timeZone: bodyStr(body, "timeZone") } : {}),
    });
    return jsonResponseFor(request, { ok: true, data: result });
  } catch (error) {
    const msg = normalizeErrorMessage(error);
    return errorResponse(request, 500, "profile_update_failed", msg);
  }
}
