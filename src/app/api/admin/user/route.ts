import { bad, jsonResponseFor } from "@/lib/edge/admin-response";
import { requireSameOrigin } from "@/lib/edge/utils";
import {
  createAdminUser,
  removeAdminUser,
  updateAdminUser,
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
  const intent = bodyStr(body, "intent") || "create";

  try {
    if (intent === "remove" || intent === "delete") {
      const userId = bodyStr(body, "userId");
      if (!userId) {
        return bad("Missing user ID", "missing_user_id", request);
      }

      const result = await removeAdminUser({ userId });
      return jsonResponseFor(request, { ok: true, data: result });
    }

    if (intent === "update") {
      const userId = bodyStr(body, "userId");
      if (!userId) {
        return bad("Missing user ID", "missing_user_id", request);
      }

      const result = await updateAdminUser({
        userId,
        username: bodyStr(body, "username") || undefined,
        email: bodyStr(body, "email") || undefined,
        name: bodyStr(body, "name") || undefined,
        password: bodyStr(body, "password") || undefined,
        systemRole:
          bodyStr(body, "systemRole").toLowerCase() === "admin"
            ? "admin"
            : "user",
      });
      return jsonResponseFor(request, { ok: true, data: result });
    }

    const username = bodyStr(body, "username");
    const email = bodyStr(body, "email");
    const password = String(body.password ?? "");
    const name = bodyStr(body, "name");
    const systemRole =
      bodyStr(body, "systemRole").toLowerCase() === "admin" ? "admin" : "user";

    if (!username || !email || password.length < 8) {
      return bad("Invalid user input", "invalid_user_input", request);
    }

    const result = await createAdminUser({
      username,
      email,
      password,
      name: name || undefined,
      systemRole,
    });
    return jsonResponseFor(request, { ok: true, data: result });
  } catch (error) {
    const msg = normalizeErrorMessage(error);
    return errorResponse(request, 500, "user_mutation_failed", msg);
  }
}
