import { describe, expect, it } from "vitest";

import {
  defaultBotAnalyticsConfig,
  makeSecretHint,
  normalizeBotAnalyticsConfig,
  validateBotAnalyticsConfig,
  validateBotAnalyticsUpdateInput,
} from "@/lib/bot-analytics-config";

describe("bot analytics config helpers", () => {
  it("normalizes defaults, malformed values, and configured state", () => {
    expect(makeSecretHint("")).toBe("");
    expect(makeSecretHint("abcdef")).toBe("••••cdef");

    const normalized = normalizeBotAnalyticsConfig({
      accountId: " abc ",
      dataset: "",
      apiTokenEncrypted: "",
      apiTokenHint: " hint ",
      configured: true,
      updatedAt: "bad",
      updatedByUserId: 123,
    });

    expect(normalized).toMatchObject({
      accountId: "abc",
      dataset: "insightflare_bot_events",
      configured: false,
      updatedAt: 0,
      updatedByUserId: undefined,
    });

    expect(
      normalizeBotAnalyticsConfig({
        ...defaultBotAnalyticsConfig(),
        apiTokenEncrypted: "v1:secret",
        configured: true,
        updatedAt: "123",
        updatedByUserId: "admin-1",
      }),
    ).toMatchObject({
      configured: true,
      updatedAt: 123,
      updatedByUserId: "admin-1",
    });
  });

  it("validates update bodies and saved config", () => {
    expect(validateBotAnalyticsUpdateInput(null).ok).toBe(false);
    expect(validateBotAnalyticsUpdateInput([]).ok).toBe(false);
    expect(
      validateBotAnalyticsUpdateInput({
        accountId: " 442fe5198bff93bdf60d4223d9618033 ",
        dataset: " dataset ",
        apiToken: " token ",
        clearApiToken: "yes",
      }),
    ).toEqual({
      ok: true,
      input: {
        accountId: "442fe5198bff93bdf60d4223d9618033",
        dataset: "dataset",
        apiToken: "token",
        clearApiToken: false,
      },
    });

    const valid = {
      ...defaultBotAnalyticsConfig(),
      accountId: "442fe5198bff93bdf60d4223d9618033",
      dataset: "insightflare_bot_events",
    };
    expect(validateBotAnalyticsConfig(valid)).toBeNull();
    expect(validateBotAnalyticsConfig({ ...valid, accountId: "" })).toMatch(
      /Account ID/,
    );
    expect(validateBotAnalyticsConfig({ ...valid, accountId: "bad" })).toMatch(
      /32 character/,
    );
    expect(validateBotAnalyticsConfig({ ...valid, dataset: "" })).toMatch(
      /dataset is required/,
    );
    expect(
      validateBotAnalyticsConfig({ ...valid, dataset: "bad.name" }),
    ).toMatch(/unsupported/);
    expect(
      validateBotAnalyticsConfig({
        ...valid,
        configured: true,
        apiTokenEncrypted: "",
      }),
    ).toMatch(/API token/);
  });
});
