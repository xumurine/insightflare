import nextWorker from "../.open-next/worker.js";
import { runHourlyAggregation } from "../src/lib/edge/hourly-rollup";
import { IngestDurableObject as BaseIngestDurableObject } from "../src/lib/edge/ingest-do";
import { getScheduledTaskDefinition } from "../src/lib/edge/scheduled-task-registry";
import { runScheduledTask } from "../src/lib/edge/scheduled-task-runner";

// Session token 验证辅助函数
function base64UrlDecode(input) {
  const padded =
    input.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((input.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hmacSha256(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return new Uint8Array(sig);
}

async function verifySessionToken(token, secret) {
  if (!token || token.length < 20) return null;
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  const expectedSig = await hmacSha256(payloadPart, secret);
  let actualSig;
  try {
    actualSig = base64UrlDecode(signaturePart);
  } catch {
    return null;
  }
  if (!bytesEqual(expectedSig, actualSig)) return null;

  try {
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadPart));
    const parsed = JSON.parse(payloadJson);
    if (!parsed || typeof parsed !== "object") return null;

    const { userId, username, exp } = parsed;
    if (!userId || !username || !exp) return null;
    if (Math.floor(Date.now() / 1000) >= exp) return null;

    return parsed;
  } catch {
    return null;
  }
}

async function deriveSessionSecret(env) {
  const explicit = env.DASHBOARD_SESSION_SECRET || env.SESSION_SECRET;
  if (explicit) return explicit;

  const root = env.MAIN_SECRET || env.DAILY_SALT_SECRET;
  if (!root) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(root),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("insightflare:dashboard-session:v1"),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractSessionToken(request) {
  // 从 Authorization header 提取
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  // 从 cookie 提取
  const cookie = request.headers.get("cookie") || "";
  if (!cookie) return "";
  const parts = cookie.split(";");
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === "if_session") {
      try {
        return decodeURIComponent(rawValue.join("="));
      } catch {
        return rawValue.join("=");
      }
    }
  }
  return "";
}

async function canSessionReadSite(env, session, siteId) {
  if (session.systemRole === "admin") {
    const site = await env.DB.prepare("SELECT id FROM sites WHERE id=? LIMIT 1")
      .bind(siteId)
      .first();
    return Boolean(site?.id);
  }

  const site = await env.DB.prepare(
    `SELECT s.id
     FROM sites s
     INNER JOIN teams t ON t.id = s.team_id
     LEFT JOIN team_members tm ON tm.team_id = s.team_id AND tm.user_id = ?
     WHERE s.id = ? AND (t.owner_user_id = ? OR tm.user_id IS NOT NULL)
     LIMIT 1`,
  )
    .bind(session.userId, siteId, session.userId)
    .first();

  return Boolean(site?.id);
}

async function handleAdminWs(request, env) {
  // 验证 Session token
  const secret = await deriveSessionSecret(env);
  if (!secret) {
    return new Response("Service unavailable", { status: 503 });
  }

  const token = extractSessionToken(request);
  const session = await verifySessionToken(token, secret);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const incomingUrl = new URL(request.url);
  const siteId = incomingUrl.searchParams.get("siteId");
  if (!siteId) {
    return new Response("siteId is required", { status: 400 });
  }

  const allowed = await canSessionReadSite(env, session, siteId);
  if (!allowed) {
    return new Response("Forbidden", { status: 403 });
  }

  const doId = env.INGEST_DO.idFromName(siteId);
  const stub = env.INGEST_DO.get(doId);
  const forwardUrl = "https://ingest.internal/ws" + incomingUrl.search;
  return stub.fetch(new Request(forwardUrl, request));
}

export class IngestDurableObject extends BaseIngestDurableObject {}

function shouldSkipScheduledTasks(env) {
  return env.DISABLE_CRON_TASKS === "1" || env.NEXT_PUBLIC_DEMO_MODE === "1";
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === "/admin/ws") {
      return handleAdminWs(request, env);
    }
    return nextWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (shouldSkipScheduledTasks(env)) {
      console.info(
        JSON.stringify({
          event: "scheduled_tasks_skipped",
          reason: "disabled_by_environment",
        }),
      );
      return;
    }
    const task = getScheduledTaskDefinition("visit_hourly_rollup");
    ctx.waitUntil(
      runScheduledTask(
        env,
        {
          key: task?.key || "visit_hourly_rollup",
          name: task?.name || "Hourly visit aggregation",
          triggerType: "cron",
        },
        controller.scheduledTime,
        ({ logger }) =>
          runHourlyAggregation(env, controller.scheduledTime, { logger }),
      ),
    );
  },
};
