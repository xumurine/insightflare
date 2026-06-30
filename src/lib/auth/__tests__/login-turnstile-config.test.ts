import { describe, expect, it } from "vitest";

import {
  defaultLoginTurnstileConfig,
  makeSecretHint,
  normalizeLoginTurnstileConfig,
  redactLoginTurnstileConfig,
  toLoginTurnstileRuntimeConfig,
  validateLoginTurnstileConfig,
  validateLoginTurnstileUpdateInput,
} from "@/lib/auth/login-turnstile-config";

describe("login Turnstile config", () => {
  it("normalizes invalid input to the disabled default", () => {
    expect(normalizeLoginTurnstileConfig(null)).toEqual(
      defaultLoginTurnstileConfig(),
    );
    expect(
      normalizeLoginTurnstileConfig({
        enabled: true,
        siteKey: " 0xsite ",
        secretKeyEncrypted: " encrypted ",
        mode: "managed",
      }),
    ).toMatchObject({
      enabled: true,
      siteKey: "0xsite",
      secretKeyEncrypted: "encrypted",
      mode: "invisible",
    });
  });

  it("redacts encrypted secrets and exposes only configured state", () => {
    const redacted = redactLoginTurnstileConfig({
      ...defaultLoginTurnstileConfig(),
      enabled: true,
      siteKey: "0xsite",
      secretKeyEncrypted: "encrypted-secret",
      secretKeyHint: "••••test",
    });

    expect(redacted).toEqual({
      enabled: true,
      siteKey: "0xsite",
      mode: "invisible",
      secretKeyConfigured: true,
      secretKeyHint: "••••test",
      updatedAt: 0,
    });
    expect(JSON.stringify(redacted)).not.toContain("encrypted-secret");
  });

  it("requires site key and secret when enabled", () => {
    expect(
      validateLoginTurnstileConfig({
        ...defaultLoginTurnstileConfig(),
        enabled: true,
      }),
    ).toContain("Site Key");
    expect(
      validateLoginTurnstileConfig({
        ...defaultLoginTurnstileConfig(),
        enabled: true,
        siteKey: "0xsite",
      }),
    ).toContain("Secret Key");
  });

  it("creates runtime snapshots only for enabled complete configs", () => {
    expect(toLoginTurnstileRuntimeConfig(defaultLoginTurnstileConfig())).toBe(
      null,
    );
    expect(
      toLoginTurnstileRuntimeConfig({
        ...defaultLoginTurnstileConfig(),
        enabled: true,
        siteKey: "0xsite",
        secretKeyEncrypted: "encrypted",
        updatedAt: 123,
      }),
    ).toEqual({
      enabled: true,
      siteKey: "0xsite",
      mode: "invisible",
      secretKeyEncrypted: "encrypted",
      updatedAt: 123,
    });
  });

  it("validates update payloads and generates secret hints", () => {
    expect(makeSecretHint("secret-value")).toBe("••••alue");
    expect(validateLoginTurnstileUpdateInput({ enabled: "yes" })).toEqual({
      ok: false,
      message: "enabled must be a boolean",
    });
    expect(
      validateLoginTurnstileUpdateInput({
        enabled: true,
        siteKey: " 0xsite ",
        secretKey: " secret ",
      }),
    ).toEqual({
      ok: true,
      input: {
        enabled: true,
        siteKey: "0xsite",
        secretKey: "secret",
      },
    });
  });
});
