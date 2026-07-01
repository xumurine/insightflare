import { describe, expect, it } from "vitest";

import {
  defaultLoginTurnstileConfig,
  makeSecretHint,
  normalizeLoginTurnstileConfig,
  redactLoginTurnstileConfig,
  toLoginTurnstileRuntimeConfig,
  toPublicLoginTurnstileConfig,
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
    expect(makeSecretHint("   ")).toBe("");
    expect(validateLoginTurnstileUpdateInput(null)).toEqual({
      ok: false,
      message: "Invalid request body",
    });
    expect(validateLoginTurnstileUpdateInput({ enabled: "yes" })).toEqual({
      ok: false,
      message: "enabled must be a boolean",
    });
    expect(validateLoginTurnstileUpdateInput({ siteKey: 123 })).toEqual({
      ok: false,
      message: "siteKey must be a string",
    });
    expect(validateLoginTurnstileUpdateInput({ secretKey: false })).toEqual({
      ok: false,
      message: "secretKey must be a string",
    });
    expect(
      validateLoginTurnstileUpdateInput({ siteKey: "x".repeat(257) }),
    ).toEqual({
      ok: false,
      message: "siteKey is too long",
    });
    expect(
      validateLoginTurnstileUpdateInput({ secretKey: "x".repeat(513) }),
    ).toEqual({
      ok: false,
      message: "secretKey is too long",
    });
    expect(
      validateLoginTurnstileUpdateInput({ extra: "x".repeat(4100) }),
    ).toEqual({
      ok: false,
      message: "Request body is too large",
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

  it("normalizes public runtime output and disabled validation branches", () => {
    expect(toPublicLoginTurnstileConfig(null)).toEqual({
      enabled: false,
      siteKey: "",
      mode: "invisible",
    });
    expect(
      toPublicLoginTurnstileConfig({
        enabled: true,
        siteKey: "",
        mode: "invisible",
        secretKeyEncrypted: "encrypted",
        updatedAt: 1,
      }),
    ).toEqual({
      enabled: false,
      siteKey: "",
      mode: "invisible",
    });
    expect(
      toPublicLoginTurnstileConfig({
        enabled: true,
        siteKey: "0xsite",
        mode: "invisible",
        secretKeyEncrypted: "encrypted",
        updatedAt: 1,
      }),
    ).toEqual({
      enabled: true,
      siteKey: "0xsite",
      mode: "invisible",
    });

    expect(validateLoginTurnstileConfig(defaultLoginTurnstileConfig())).toBe(
      null,
    );
    expect(
      validateLoginTurnstileConfig({
        ...defaultLoginTurnstileConfig(),
        siteKey: "x".repeat(257),
      }),
    ).toBe("siteKey is too long");
    expect(
      validateLoginTurnstileConfig({
        ...defaultLoginTurnstileConfig(),
        mode: "managed" as "invisible",
      }),
    ).toBe("Unsupported Turnstile mode");
  });
});
