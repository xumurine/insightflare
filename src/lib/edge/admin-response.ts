export type JsonRecord = Record<string, unknown>;

export const j = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export const bad = (m: string) => j({ ok: false, error: m }, 400);
export const una = (m = "Unauthorized") => j({ ok: false, error: m }, 401);
export const forb = (m = "Forbidden") => j({ ok: false, error: m }, 403);
export const nf = (m = "Not Found") => j({ ok: false, error: m }, 404);
export const na = () => j({ ok: false, error: "Method Not Allowed" }, 405);

export const toRole = (v: unknown): "admin" | "user" =>
  String(v || "user").toLowerCase() === "admin" ? "admin" : "user";

export const bool = (v: unknown, fb = false) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string")
    return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
  return fb;
};

export const parseJson = async (r: Request): Promise<JsonRecord> => {
  try {
    const p = (await r.json()) as unknown;
    if (p && typeof p === "object") return p as JsonRecord;
  } catch {}
  return {};
};
