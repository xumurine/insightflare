import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendResendEmailWithRetry } from "@/lib/notifications/resend-client";

const payload = {
  from: "InsightFlare <from@example.test>",
  to: ["user@example.test"],
  subject: "Subject",
  text: "Text",
  html: "<p>Text</p>",
};

async function send(fetchImpl: typeof fetch, deadlineMs = 9_000) {
  const promise = sendResendEmailWithRetry({
    apiKey: "re_secret",
    body: payload,
    fetchImpl,
    deadlineMs,
  });
  await vi.runAllTimersAsync();
  return promise;
}

describe("sendResendEmailWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries a network failure and succeeds on the second attempt", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
      );

    const result = await send(fetchImpl);

    expect(result).toMatchObject({
      ok: true,
      attempts: 2,
      retryCount: 1,
      providerMessageId: "email-1",
    });
  });

  it("retries a 500 response and succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "temporary" }), {
          status: 500,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "email-2" }), { status: 200 }),
      );

    const result = await send(fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("does not retry deterministic 4xx errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "invalid_from" }), {
        status: 400,
      }),
    );

    const result = await send(fetchImpl);

    expect(result).toMatchObject({
      ok: false,
      attempts: 1,
      retryCount: 0,
      reason: "provider_failed",
      errorMessage: "invalid_from",
    });
  });

  it("retries 429 responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "rate_limited" }), {
          status: 429,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "email-3" }), { status: 200 }),
      );

    const result = await send(fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("returns network_failed after repeated network failures within deadline", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network"));

    const result = await send(fetchImpl);

    expect(result).toMatchObject({
      ok: false,
      attempts: 3,
      retryCount: 2,
      reason: "network_failed",
      errorMessage: "Unable to reach Resend email API",
    });
  });

  it("stops when a short deadline leaves no retry budget", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network"));

    const result = await send(fetchImpl, 500);

    expect(result.ok).toBe(false);
    expect(result.durationMs).toBeLessThanOrEqual(500);
    expect(result.attempts).toBeLessThanOrEqual(1);
  });
});
