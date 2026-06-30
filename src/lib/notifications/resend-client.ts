import { clampString } from "@/lib/edge/utils";

const RESEND_EMAILS_API_URL = "https://api.resend.com/emails";
const NETWORK_ERROR_MESSAGE = "Unable to reach Resend email API";

export interface ResendEmailPayload {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  reply_to?: string;
}

export interface ResendSendResult {
  ok: boolean;
  status: number;
  payload: Record<string, unknown>;
  providerMessageId: string;
  errorMessage: string;
  durationMs: number;
  attempts: number;
  retryCount: number;
  reason?: "provider_failed" | "network_failed";
}

export function buildResendFromAddress(input: {
  fromName: string;
  fromEmail: string;
}): string {
  const name = input.fromName.trim();
  if (!name) return input.fromEmail;
  const escaped = name.replace(/["\\]/g, "");
  return `${escaped} <${input.fromEmail}>`;
}

export function sanitizeProviderError(value: unknown): string {
  if (!value || typeof value !== "object") {
    return clampString(String(value || "provider_error"), 180);
  }
  const record = value as Record<string, unknown>;
  const message =
    (typeof record.message === "string" && record.message) ||
    (typeof record.error === "string" && record.error) ||
    (typeof record.name === "string" && record.name) ||
    "provider_error";
  return clampString(message, 180);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempts: number): number {
  const base = attempts <= 1 ? 450 : 1_350;
  const jitter = Math.floor(Math.random() * (attempts <= 1 ? 151 : 451));
  return base + jitter;
}

async function fetchWithTimeout(input: {
  apiKey: string;
  body: ResendEmailPayload;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    return await input.fetchImpl(RESEND_EMAILS_API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function sendResendEmailWithRetry(input: {
  apiKey: string;
  body: ResendEmailPayload;
  fetchImpl?: typeof fetch;
  deadlineMs?: number;
  maxAttempts?: number;
}): Promise<ResendSendResult> {
  const startedAt = Date.now();
  const deadlineAt = startedAt + Math.max(500, input.deadlineMs ?? 9_000);
  const maxAttempts = Math.max(1, Math.trunc(input.maxAttempts ?? 3));
  const fetchImpl = input.fetchImpl ?? fetch;
  let attempts = 0;
  let status = 0;
  let payload: Record<string, unknown> = {};
  let errorMessage = "";
  let reason: "provider_failed" | "network_failed" = "network_failed";

  while (attempts < maxAttempts && Date.now() < deadlineAt) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs < 500) break;
    attempts += 1;
    try {
      const response = await fetchWithTimeout({
        apiKey: input.apiKey,
        body: input.body,
        fetchImpl,
        timeoutMs: Math.max(250, Math.min(5_000, remainingMs - 250)),
      });
      status = response.status;
      payload = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (response.ok) {
        return {
          ok: true,
          status,
          payload,
          providerMessageId:
            typeof payload.id === "string" ? clampString(payload.id, 120) : "",
          errorMessage: "",
          durationMs: Date.now() - startedAt,
          attempts,
          retryCount: Math.max(0, attempts - 1),
        };
      }
      reason = "provider_failed";
      errorMessage = sanitizeProviderError(payload);
      if (!isRetryableStatus(response.status)) {
        return {
          ok: false,
          status,
          payload,
          providerMessageId: "",
          errorMessage,
          durationMs: Date.now() - startedAt,
          attempts,
          retryCount: Math.max(0, attempts - 1),
          reason,
        };
      }
    } catch {
      status = 0;
      payload = {};
      reason = "network_failed";
      errorMessage = NETWORK_ERROR_MESSAGE;
    }

    if (attempts >= maxAttempts) break;
    const waitMs = backoffMs(attempts);
    if (Date.now() + waitMs >= deadlineAt) break;
    await delay(waitMs);
  }

  return {
    ok: false,
    status,
    payload,
    providerMessageId: "",
    errorMessage: errorMessage || NETWORK_ERROR_MESSAGE,
    durationMs: Date.now() - startedAt,
    attempts,
    retryCount: Math.max(0, attempts - 1),
    reason,
  };
}
