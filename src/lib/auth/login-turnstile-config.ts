export const SYSTEM_LOGIN_TURNSTILE_CONFIG_KEY = "system.login_turnstile";

export const LOGIN_TURNSTILE_RUNTIME_KV_KEY = "system:login-turnstile:runtime";

export type LoginTurnstileMode = "invisible";

export interface LoginTurnstileConfig {
  enabled: boolean;
  siteKey: string;
  secretKeyEncrypted: string;
  secretKeyHint: string;
  mode: LoginTurnstileMode;
  updatedAt: number;
  updatedByUserId: string;
}

export interface PublicLoginTurnstileConfig {
  enabled: boolean;
  siteKey: string;
  mode: LoginTurnstileMode;
}

export interface AdminPublicLoginTurnstileConfig extends PublicLoginTurnstileConfig {
  secretKeyConfigured: boolean;
  secretKeyHint: string;
  updatedAt: number;
}

export interface LoginTurnstileRuntimeConfig extends PublicLoginTurnstileConfig {
  secretKeyEncrypted: string;
  updatedAt: number;
}

export interface LoginTurnstileUpdateInput {
  enabled?: boolean;
  siteKey?: string;
  secretKey?: string;
}

export type LoginTurnstileValidationResult =
  | { ok: true; input: LoginTurnstileUpdateInput }
  | { ok: false; message: string };

const MAX_SITE_KEY_LENGTH = 256;
const MAX_SECRET_KEY_LENGTH = 512;
const MAX_PAYLOAD_LENGTH = 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeMode(_value: unknown): LoginTurnstileMode {
  return "invisible";
}

export function defaultLoginTurnstileConfig(): LoginTurnstileConfig {
  return {
    enabled: false,
    siteKey: "",
    secretKeyEncrypted: "",
    secretKeyHint: "",
    mode: "invisible",
    updatedAt: 0,
    updatedByUserId: "",
  };
}

export function normalizeLoginTurnstileConfig(
  raw: unknown,
): LoginTurnstileConfig {
  const defaults = defaultLoginTurnstileConfig();
  if (!isRecord(raw)) return defaults;

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
    siteKey: cleanString(raw.siteKey, MAX_SITE_KEY_LENGTH),
    secretKeyEncrypted: cleanString(raw.secretKeyEncrypted, 4096),
    secretKeyHint: cleanString(raw.secretKeyHint, 32),
    mode: normalizeMode(raw.mode),
    updatedAt:
      typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : defaults.updatedAt,
    updatedByUserId: cleanString(raw.updatedByUserId, 120),
  };
}

export function redactLoginTurnstileConfig(
  config: LoginTurnstileConfig,
): AdminPublicLoginTurnstileConfig {
  return {
    enabled: config.enabled,
    siteKey: config.siteKey,
    mode: config.mode,
    secretKeyConfigured: config.secretKeyEncrypted.length > 0,
    secretKeyHint: config.secretKeyHint,
    updatedAt: config.updatedAt,
  };
}

export function toLoginTurnstileRuntimeConfig(
  config: LoginTurnstileConfig,
): LoginTurnstileRuntimeConfig | null {
  if (!config.enabled) return null;
  if (!config.siteKey || !config.secretKeyEncrypted) return null;
  return {
    enabled: true,
    siteKey: config.siteKey,
    mode: config.mode,
    secretKeyEncrypted: config.secretKeyEncrypted,
    updatedAt: config.updatedAt,
  };
}

export function toPublicLoginTurnstileConfig(
  runtime: LoginTurnstileRuntimeConfig | null,
): PublicLoginTurnstileConfig {
  if (!runtime?.enabled || !runtime.siteKey) {
    return { enabled: false, siteKey: "", mode: "invisible" };
  }
  return {
    enabled: true,
    siteKey: runtime.siteKey,
    mode: runtime.mode,
  };
}

export function makeSecretHint(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length === 0) return "";
  return `••••${trimmed.slice(-4)}`;
}

export function validateLoginTurnstileUpdateInput(
  payload: unknown,
): LoginTurnstileValidationResult {
  if (!isRecord(payload)) {
    return { ok: false, message: "Invalid request body" };
  }

  const serializedLength = JSON.stringify(payload).length;
  if (serializedLength > MAX_PAYLOAD_LENGTH) {
    return { ok: false, message: "Request body is too large" };
  }

  const input: LoginTurnstileUpdateInput = {};

  if (Object.prototype.hasOwnProperty.call(payload, "enabled")) {
    if (typeof payload.enabled !== "boolean") {
      return { ok: false, message: "enabled must be a boolean" };
    }
    input.enabled = payload.enabled;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "siteKey")) {
    if (typeof payload.siteKey !== "string") {
      return { ok: false, message: "siteKey must be a string" };
    }
    const siteKey = payload.siteKey.trim();
    if (siteKey.length > MAX_SITE_KEY_LENGTH) {
      return { ok: false, message: "siteKey is too long" };
    }
    input.siteKey = siteKey;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "secretKey")) {
    if (typeof payload.secretKey !== "string") {
      return { ok: false, message: "secretKey must be a string" };
    }
    const secretKey = payload.secretKey.trim();
    if (secretKey.length > MAX_SECRET_KEY_LENGTH) {
      return { ok: false, message: "secretKey is too long" };
    }
    input.secretKey = secretKey;
  }

  return { ok: true, input };
}

export function validateLoginTurnstileConfig(
  config: LoginTurnstileConfig,
): string | null {
  if (config.mode !== "invisible") {
    return "Unsupported Turnstile mode";
  }
  if (config.siteKey.length > MAX_SITE_KEY_LENGTH) {
    return "siteKey is too long";
  }
  if (!config.enabled) return null;
  if (!config.siteKey) {
    return "Site Key is required when login Turnstile is enabled";
  }
  if (!config.secretKeyEncrypted) {
    return "Secret Key is required when login Turnstile is enabled";
  }
  return null;
}
