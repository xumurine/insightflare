export type JsonRecord = Record<string, unknown>;

export interface ResponseContext {
  requestId: string;
}

export const j = jsonResponse;

export function getRequestId(request?: Request | null): string {
  if (request) {
    const cfRay = request.headers.get("cf-ray");
    if (cfRay) return cfRay;
    const xRequestId = request.headers.get("x-request-id");
    if (xRequestId) return xRequestId;
  }
  return crypto.randomUUID().slice(0, 12);
}

export function toErrorCode(msg: string): string {
  return (
    msg
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 64) || "error"
  );
}

export function jsonResponse(
  payload: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(extraHeaders ?? {}),
    },
  });
}

export function jsonResponseFor(
  req: Request,
  payload: object,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  const body = {
    ...(payload as Record<string, unknown>),
    requestId: getRequestId(req),
    timestamp: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(extraHeaders ?? {}),
    },
  });
}

export function jsonResponseWith(
  ctx: ResponseContext | undefined,
  payload: Record<string, unknown>,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  if (!ctx) return jsonResponse(payload, status, extraHeaders);
  const body = {
    ...payload,
    requestId: ctx.requestId,
    timestamp: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(extraHeaders ?? {}),
    },
  });
}

export function errorResponse(
  req: Request | undefined | null,
  status: number,
  code: string,
  message: string,
  extraHeaders?: Record<string, string>,
): Response {
  const requestId = getRequestId(req);
  return new Response(
    JSON.stringify({
      ok: false,
      requestId,
      timestamp: new Date().toISOString(),
      error: { code, message },
    }),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(extraHeaders ?? {}),
      },
    },
  );
}

export function bad(msg: string, code?: string, req?: Request): Response {
  return errorResponse(req ?? null, 400, code ?? toErrorCode(msg), msg);
}

export function una(
  msg = "Unauthorized",
  code?: string,
  req?: Request,
): Response {
  return errorResponse(req ?? null, 401, code ?? toErrorCode(msg), msg);
}

export function forb(
  msg = "Forbidden",
  code?: string,
  req?: Request,
): Response {
  return errorResponse(req ?? null, 403, code ?? toErrorCode(msg), msg);
}

export function nf(msg = "Not Found", code?: string, req?: Request): Response {
  return errorResponse(req ?? null, 404, code ?? toErrorCode(msg), msg);
}

export function na(req?: Request): Response {
  return errorResponse(
    req ?? null,
    405,
    "method_not_allowed",
    "Method Not Allowed",
  );
}

export function normalizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const jsonStart = raw.lastIndexOf("{");
  if (jsonStart >= 0) {
    const maybeJson = raw.slice(jsonStart).trim();
    try {
      const parsed = JSON.parse(maybeJson) as {
        message?: unknown;
        error?: unknown;
      };
      if (typeof parsed.message === "string" && parsed.message.trim())
        return parsed.message.trim();
      if (typeof parsed.error === "string" && parsed.error.trim())
        return parsed.error.trim();
    } catch {
      // fall through to raw
    }
  }
  return raw;
}
