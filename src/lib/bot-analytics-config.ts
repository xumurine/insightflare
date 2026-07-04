export const SYSTEM_BOT_ANALYTICS_CONFIG_KEY = "system.bot_analytics_reader.v1";

export interface BotAnalyticsConfig {
  accountId: string;
  dataset: string;
  apiTokenEncrypted: string;
  apiTokenHint: string;
  configured: boolean;
  updatedAt: number;
  updatedByUserId?: string;
}

export interface PublicBotAnalyticsConfig {
  accountId: string;
  analyticsEngineDisabled: boolean;
  analyticsEngineEnableUrl: string;
  dataset: string;
  apiTokenConfigured: boolean;
  apiTokenHint: string;
  updatedAt: number;
}

export interface BotAnalyticsConfigUpdateInput {
  accountId?: string;
  dataset?: string;
  apiToken?: string;
  clearApiToken?: boolean;
}

const DEFAULT_DATASET = "insightflare_bot_events";

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function defaultBotAnalyticsConfig(): BotAnalyticsConfig {
  return {
    accountId: "",
    dataset: DEFAULT_DATASET,
    apiTokenEncrypted: "",
    apiTokenHint: "",
    configured: false,
    updatedAt: 0,
  };
}

export function makeSecretHint(secret: string): string {
  const value = secret.trim();
  return value ? `••••${value.slice(-4)}` : "";
}

export function normalizeBotAnalyticsConfig(
  raw: Record<string, unknown>,
): BotAnalyticsConfig {
  const config = defaultBotAnalyticsConfig();
  config.accountId = cleanString(raw.accountId, 128);
  config.dataset = cleanString(raw.dataset, 128) || DEFAULT_DATASET;
  config.apiTokenEncrypted = cleanString(raw.apiTokenEncrypted, 4096);
  config.apiTokenHint = cleanString(raw.apiTokenHint, 80);
  config.configured =
    Boolean(raw.configured) && Boolean(config.apiTokenEncrypted);
  config.updatedAt = Number.isFinite(Number(raw.updatedAt))
    ? Number(raw.updatedAt)
    : 0;
  config.updatedByUserId = cleanString(raw.updatedByUserId, 128) || undefined;
  return config;
}

export function redactBotAnalyticsConfig(
  config: BotAnalyticsConfig,
  availability?: {
    analyticsEngineDisabled?: boolean;
    analyticsEngineEnableUrl?: string;
  },
): PublicBotAnalyticsConfig {
  return {
    accountId: config.accountId,
    analyticsEngineDisabled: availability?.analyticsEngineDisabled ?? false,
    analyticsEngineEnableUrl: availability?.analyticsEngineEnableUrl ?? "",
    dataset: config.dataset,
    apiTokenConfigured: config.configured,
    apiTokenHint: config.apiTokenHint,
    updatedAt: config.updatedAt,
  };
}

export function validateBotAnalyticsUpdateInput(
  raw: unknown,
):
  | { ok: true; input: BotAnalyticsConfigUpdateInput }
  | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "Invalid request body" };
  }
  const body = raw as Record<string, unknown>;
  const input: BotAnalyticsConfigUpdateInput = {};
  if ("accountId" in body) input.accountId = cleanString(body.accountId, 128);
  if ("dataset" in body) input.dataset = cleanString(body.dataset, 128);
  if ("apiToken" in body) input.apiToken = cleanString(body.apiToken, 4096);
  if ("clearApiToken" in body) {
    input.clearApiToken = body.clearApiToken === true;
  }
  return { ok: true, input };
}

export function validateBotAnalyticsConfig(
  config: BotAnalyticsConfig,
): string | null {
  if (!config.accountId) return "Cloudflare Account ID is required";
  if (!/^[a-f0-9]{32}$/i.test(config.accountId)) {
    return "Cloudflare Account ID must be a 32 character hex string";
  }
  if (!config.dataset) return "Analytics Engine dataset is required";
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/.test(config.dataset)) {
    return "Analytics Engine dataset contains unsupported characters";
  }
  if (config.configured && !config.apiTokenEncrypted) {
    return "Cloudflare API token is required";
  }
  return null;
}
