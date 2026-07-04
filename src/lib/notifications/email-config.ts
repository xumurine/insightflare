export const SYSTEM_NOTIFICATION_EMAIL_CONFIG_KEY =
  "system:notifications:email";

export type NotificationEmailProvider = "none" | "resend";

export interface NotificationEmailConfig {
  version: 1;
  enabled: boolean;
  provider: NotificationEmailProvider;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  resend: {
    apiKeyEncrypted: string;
    apiKeyHint: string;
    configured: boolean;
  };
  updatedAt: number;
  updatedByUserId: string;
}

export interface PublicNotificationEmailConfig {
  enabled: boolean;
  provider: NotificationEmailProvider;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  resend: {
    configured: boolean;
    apiKeyHint: string;
  };
  updatedAt: number;
}

export interface NotificationEmailConfigUpdateInput {
  enabled?: boolean;
  provider?: NotificationEmailProvider;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  resendApiKey?: string;
  clearResendApiKey?: boolean;
}

export type NotificationEmailValidationResult =
  | { ok: true; input: NotificationEmailConfigUpdateInput }
  | { ok: false; message: string };

const DEFAULT_FROM_NAME = "InsightFlare";
const MAX_FROM_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_API_KEY_LENGTH = 512;
const MAX_PAYLOAD_LENGTH = 4096;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeProvider(value: unknown): NotificationEmailProvider {
  return value === "none" ? "none" : "resend";
}

export function defaultNotificationEmailConfig(): NotificationEmailConfig {
  return {
    version: 1,
    enabled: false,
    provider: "resend",
    fromName: DEFAULT_FROM_NAME,
    fromEmail: "",
    replyTo: "",
    resend: {
      apiKeyEncrypted: "",
      apiKeyHint: "",
      configured: false,
    },
    updatedAt: 0,
    updatedByUserId: "",
  };
}

export function normalizeNotificationEmailConfig(
  raw: unknown,
): NotificationEmailConfig {
  const defaults = defaultNotificationEmailConfig();
  if (!isRecord(raw)) return defaults;

  const resend = isRecord(raw.resend) ? raw.resend : {};
  const apiKeyEncrypted = cleanString(resend.apiKeyEncrypted, 4096);
  const apiKeyHint = cleanString(resend.apiKeyHint, 32);

  return {
    version: 1,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
    provider: normalizeProvider(raw.provider),
    fromName:
      cleanString(raw.fromName, MAX_FROM_NAME_LENGTH) || DEFAULT_FROM_NAME,
    fromEmail: cleanString(raw.fromEmail, MAX_EMAIL_LENGTH),
    replyTo: cleanString(raw.replyTo, MAX_EMAIL_LENGTH),
    resend: {
      apiKeyEncrypted,
      apiKeyHint,
      configured:
        typeof resend.configured === "boolean"
          ? resend.configured && apiKeyEncrypted.length > 0
          : apiKeyEncrypted.length > 0,
    },
    updatedAt:
      typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : defaults.updatedAt,
    updatedByUserId: cleanString(raw.updatedByUserId, 120),
  };
}

export function redactNotificationEmailConfig(
  config: NotificationEmailConfig,
): PublicNotificationEmailConfig {
  return {
    enabled: config.enabled,
    provider: config.provider,
    fromName: config.fromName,
    fromEmail: config.fromEmail,
    replyTo: config.replyTo,
    resend: {
      configured: config.resend.configured,
      apiKeyHint: config.resend.apiKeyHint,
    },
    updatedAt: config.updatedAt,
  };
}

export function isValidEmail(value: string): boolean {
  return (
    value.length > 0 && value.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(value)
  );
}

export function makeSecretHint(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length === 0) return "";
  return `••••${trimmed.slice(-4)}`;
}

export function validateNotificationEmailUpdateInput(
  payload: unknown,
): NotificationEmailValidationResult {
  if (!isRecord(payload)) {
    return { ok: false, message: "Invalid request body" };
  }

  const serializedLength = JSON.stringify(payload).length;
  if (serializedLength > MAX_PAYLOAD_LENGTH) {
    return { ok: false, message: "Request body is too large" };
  }

  const input: NotificationEmailConfigUpdateInput = {};

  if (Object.prototype.hasOwnProperty.call(payload, "enabled")) {
    if (typeof payload.enabled !== "boolean") {
      return { ok: false, message: "enabled must be a boolean" };
    }
    input.enabled = payload.enabled;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "provider")) {
    if (payload.provider !== "resend" && payload.provider !== "none") {
      return { ok: false, message: "Unsupported email provider" };
    }
    input.provider = payload.provider;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "fromName")) {
    const fromName = cleanString(payload.fromName, MAX_FROM_NAME_LENGTH + 1);
    if (fromName.length > MAX_FROM_NAME_LENGTH) {
      return { ok: false, message: "fromName is too long" };
    }
    input.fromName = fromName || DEFAULT_FROM_NAME;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "fromEmail")) {
    const fromEmail = cleanString(payload.fromEmail, MAX_EMAIL_LENGTH + 1);
    if (fromEmail.length > MAX_EMAIL_LENGTH) {
      return { ok: false, message: "fromEmail is too long" };
    }
    if (fromEmail && !isValidEmail(fromEmail)) {
      return { ok: false, message: "Invalid fromEmail" };
    }
    input.fromEmail = fromEmail;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "replyTo")) {
    const replyTo = cleanString(payload.replyTo, MAX_EMAIL_LENGTH + 1);
    if (replyTo.length > MAX_EMAIL_LENGTH) {
      return { ok: false, message: "replyTo is too long" };
    }
    if (replyTo && !isValidEmail(replyTo)) {
      return { ok: false, message: "Invalid replyTo" };
    }
    input.replyTo = replyTo;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "resendApiKey")) {
    if (typeof payload.resendApiKey !== "string") {
      return { ok: false, message: "resendApiKey must be a string" };
    }
    const resendApiKey = payload.resendApiKey.trim();
    if (resendApiKey.length > MAX_API_KEY_LENGTH) {
      return { ok: false, message: "resendApiKey is too long" };
    }
    input.resendApiKey = resendApiKey;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "clearResendApiKey")) {
    if (typeof payload.clearResendApiKey !== "boolean") {
      return { ok: false, message: "clearResendApiKey must be a boolean" };
    }
    input.clearResendApiKey = payload.clearResendApiKey;
  }

  return { ok: true, input };
}

export function validateNotificationEmailConfig(
  config: NotificationEmailConfig,
): string | null {
  if (config.provider !== "resend" && config.provider !== "none") {
    return "Unsupported email provider";
  }
  if (config.fromName.length > MAX_FROM_NAME_LENGTH) {
    return "fromName is too long";
  }
  if (config.fromEmail && !isValidEmail(config.fromEmail)) {
    return "Invalid fromEmail";
  }
  if (config.replyTo && !isValidEmail(config.replyTo)) {
    return "Invalid replyTo";
  }
  if (!config.enabled) return null;
  if (config.provider !== "resend") {
    return "Resend provider is required when email sending is enabled";
  }
  if (!config.fromEmail) {
    return "fromEmail is required when email sending is enabled";
  }
  if (!config.resend.configured || !config.resend.apiKeyEncrypted) {
    return "Resend API Key is required when Resend email sending is enabled";
  }
  return null;
}
