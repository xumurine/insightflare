import { updateMyProfile } from "@/lib/edge-client";
import { jsonResponseFor } from "@/lib/edge/admin-response";
import { bodyStr, parseRequestBody } from "@/lib/form-helpers";
import { errorResponse, normalizeErrorMessage } from "@/lib/response";

export async function POST(request: Request): Promise<Response> {
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
