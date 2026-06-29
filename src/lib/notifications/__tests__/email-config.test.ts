import { describe, expect, it } from "vitest";

import {
  defaultNotificationEmailConfig,
  makeSecretHint,
  normalizeNotificationEmailConfig,
  redactNotificationEmailConfig,
  validateNotificationEmailConfig,
  validateNotificationEmailUpdateInput,
} from "@/lib/notifications/email-config";

describe("notification email config", () => {
  it("normalizes missing config to defaults", () => {
    expect(normalizeNotificationEmailConfig(null)).toEqual(
      defaultNotificationEmailConfig(),
    );
  });

  it("redacts encrypted API key fields", () => {
    const redacted = redactNotificationEmailConfig(
      normalizeNotificationEmailConfig({
        enabled: true,
        provider: "resend",
        fromName: "InsightFlare",
        fromEmail: "noreply@example.test",
        resend: {
          apiKeyEncrypted: "v1:secret",
          apiKeyHint: "••••abcd",
          configured: true,
        },
      }),
    );

    expect(redacted.resend).toEqual({
      configured: true,
      apiKeyHint: "••••abcd",
    });
    expect(JSON.stringify(redacted)).not.toContain("apiKeyEncrypted");
    expect(JSON.stringify(redacted)).not.toContain("v1:secret");
  });

  it("validates update payload shape and email fields", () => {
    expect(
      validateNotificationEmailUpdateInput({
        enabled: "yes",
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateNotificationEmailUpdateInput({
        fromEmail: "not-an-email",
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateNotificationEmailUpdateInput({
        enabled: true,
        provider: "resend",
        fromEmail: "noreply@example.test",
        replyTo: "reply@example.test",
        resendApiKey: " re_demo ",
      }),
    ).toEqual({
      ok: true,
      input: {
        enabled: true,
        provider: "resend",
        fromEmail: "noreply@example.test",
        replyTo: "reply@example.test",
        resendApiKey: "re_demo",
      },
    });
  });

  it("requires a sender and API key when enabled", () => {
    const config = defaultNotificationEmailConfig();
    config.enabled = true;
    expect(validateNotificationEmailConfig(config)).toBe(
      "fromEmail is required when email sending is enabled",
    );

    config.fromEmail = "noreply@example.test";
    expect(validateNotificationEmailConfig(config)).toBe(
      "Resend API Key is required when Resend email sending is enabled",
    );
  });

  it("creates stable short secret hints", () => {
    expect(makeSecretHint("re_123456abcd")).toBe("••••abcd");
    expect(makeSecretHint("")).toBe("");
  });
});
