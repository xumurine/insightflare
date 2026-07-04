export function parseFormBool(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "on" ||
    normalized === "yes"
  );
}

export function safeRedirectPath(
  input: FormDataEntryValue | null | string | undefined,
  fallback = "/app",
): string {
  const raw = String(input || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

/**
 * Parse request body as a Record regardless of Content-Type.
 * Supports both JSON and FormData submissions.
 */
export async function parseRequestBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    return (await request.json()) as Record<string, unknown>;
  }
  const formData = await request.formData();
  const result: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/** Safely read a string field from the parsed body. */
export function bodyStr(body: Record<string, unknown>, key: string): string {
  return String(body[key] ?? "").trim();
}

// Body 大小限制常量
export const BODY_SIZE_LIMITS = {
  COLLECT: 48 * 1024, // 48KB - 采集端
  LOGIN: 4 * 1024, // 4KB - 登录接口
  ADMIN_API: 256 * 1024, // 256KB - 管理 API
} as const;

/**
 * 检查请求 body 大小是否超过限制
 * @param request - 请求对象
 * @param maxSize - 最大允许的字节数
 * @returns 如果超过限制返回错误响应，否则返回 null
 */
export function assertContentSize(
  request: Request,
  maxSize: number,
): Response | null {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const size = Number(contentLength);
    if (Number.isFinite(size) && size > maxSize) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Payload Too Large",
          maxSize,
        }),
        {
          status: 413,
          headers: { "content-type": "application/json" },
        },
      );
    }
  }
  return null;
}
