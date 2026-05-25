import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionToken, verifySessionToken } from "@/lib/session";

describe("Session Authentication (Web Crypto HMAC)", () => {
  const mockClaims = {
    userId: "user_99182",
    username: "john_doe",
    displayName: "John Doe",
    systemRole: "admin" as const,
  };

  beforeEach(() => {
    // Ensure SESSION_SECRET environment variable is set
    process.env.SESSION_SECRET =
      "a-very-long-test-session-secret-longer-than-32-bytes";
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
  });

  it("should successfully create and verify a valid session token", async () => {
    const maxAge = 3600; // 1 hour
    const token = await createSessionToken(mockClaims, maxAge);

    expect(token).toBeTypeOf("string");
    expect(token.split(".")).toHaveLength(2); // encodedPayload.signature

    const verified = await verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe(mockClaims.userId);
    expect(verified!.username).toBe(mockClaims.username);
    expect(verified!.displayName).toBe(mockClaims.displayName);
    expect(verified!.systemRole).toBe(mockClaims.systemRole);

    // Verify expiration time is correct
    const now = Math.floor(Date.now() / 1000);
    expect(verified!.exp).toBeGreaterThan(now);
    expect(verified!.exp).toBeLessThanOrEqual(now + maxAge);
  });

  it("should fail verification if the token payload or signature is tampered with", async () => {
    const token = await createSessionToken(mockClaims, 3600);
    const [payloadPart, sigPart] = token.split(".");

    // 1. Tamper with the payload's last character
    const tamperedPayload =
      payloadPart.slice(0, -1) + (payloadPart.slice(-1) === "a" ? "b" : "a");
    const tamperedToken1 = `${tamperedPayload}.${sigPart}`;
    const verified1 = await verifySessionToken(tamperedToken1);
    expect(verified1).toBeNull();

    // 2. Tamper with signature characters (modify the first two characters to break Base64 decoding)
    const tamperedSig =
      (sigPart.startsWith("ab") ? "xy" : "ab") + sigPart.slice(2);
    const tamperedToken2 = `${payloadPart}.${tamperedSig}`;
    const verified2 = await verifySessionToken(tamperedToken2);
    expect(verified2).toBeNull();
  });

  it("should fail verification and return null if the token has expired", async () => {
    vi.useFakeTimers();
    try {
      const maxAge = 10; // 10 seconds
      const token = await createSessionToken(mockClaims, maxAge);

      // Still valid after 5 seconds
      vi.advanceTimersByTime(5000);
      const verifiedMid = await verifySessionToken(token);
      expect(verifiedMid).not.toBeNull();

      // Expired after another 6 seconds (11 seconds total)
      vi.advanceTimersByTime(6000);
      const verifiedAfter = await verifySessionToken(token);
      expect(verifiedAfter).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("should robustly return null for malformed, empty, or short tokens", async () => {
    expect(await verifySessionToken(null)).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
    expect(await verifySessionToken("short")).toBeNull();
    expect(
      await verifySessionToken("no-dot-in-token-but-long-enough-1234567890"),
    ).toBeNull();
    expect(await verifySessionToken("invalid.payload.no.real.sig")).toBeNull();
  });

  it("should support overriding session secret with custom key", async () => {
    const customSecret = "custom-overridden-super-secret-key-123456";
    const token = await createSessionToken(mockClaims, 1800);

    // Verification should fail if custom key override is provided for token signed with default key
    const verifiedWrongSecret = await verifySessionToken(token, customSecret);
    expect(verifiedWrongSecret).toBeNull();
  });

  it("should handle empty or wrong secret keys gracefully conforming to fallback behaviors", async () => {
    const token = await createSessionToken(mockClaims, 1800);

    // 1. If empty string is supplied, verifySessionToken falls back to the default process.env.SESSION_SECRET.
    // Assert it successfully verifies instead of returning null or crashing.
    const verifiedEmpty = await verifySessionToken(token, "");
    expect(verifiedEmpty).not.toBeNull();
    expect(verifiedEmpty!.userId).toBe(mockClaims.userId);

    // 2. If a wrong non-empty key is supplied, fallback does not happen. Assert it securely fails and returns null.
    const verifiedWrong = await verifySessionToken(
      token,
      "invalid-secret-key-override",
    );
    expect(verifiedWrong).toBeNull();
  });

  it("should return null when token payload is valid Base64 but fails JSON parsing", async () => {
    // Construct a payload containing valid Base64 but is just raw text "invalid-json" rather than stringified JSON object
    const payloadPart = "aW52YWxpZC1qc29u"; // Base64 for "invalid-json"

    // Manually calculate signature using Node's crypto to pass the signature integrity check
    const crypto = await import("crypto");
    const secret = process.env.SESSION_SECRET || "";
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payloadPart);
    const signature = hmac.digest();

    const signaturePart = signature
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const token = `${payloadPart}.${signaturePart}`;

    // The token successfully bypasses signature equality checks, but will fail during TextDecoder and JSON parsing.
    // Assert it gracefully handles this without crashing and returns null.
    const verified = await verifySessionToken(token);
    expect(verified).toBeNull();
  });
});
