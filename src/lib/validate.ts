import type { z } from "zod";

import { bad } from "@/lib/response";

type ValidateOk<T> = { ok: true; data: T };
type ValidateFail = { ok: false; response: Response };
export type ValidateResult<T> = ValidateOk<T> | ValidateFail;

export function validateBody<T>(
  body: unknown,
  schema: z.ZodType<T>,
): ValidateResult<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => {
        const path = i.path.join(".");
        return path ? `${path}: ${i.message}` : i.message;
      })
      .join("; ");
    return { ok: false, response: bad(msg) };
  }
  return { ok: true, data: result.data };
}

export async function parseAndValidateBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ValidateResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: bad("Invalid JSON body") };
  }
  return validateBody(body, schema);
}

export function validateSearchParams<T>(
  url: URL,
  schema: z.ZodType<T>,
): ValidateResult<T> {
  const raw: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    raw[k] = v;
  });
  const result = schema.safeParse(raw);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => {
        const path = i.path.join(".");
        return path ? `${path}: ${i.message}` : i.message;
      })
      .join("; ");
    return { ok: false, response: bad(msg) };
  }
  return { ok: true, data: result.data };
}
