import { beforeEach, describe, expect, it, vi } from "vitest";

import { deliverNotificationMessage } from "@/lib/notifications/delivery";
import type { NotificationMessage } from "@/lib/notifications/message-store";

const updateNotificationDeliveryResult = vi.hoisted(() => vi.fn());
const readConfig = vi.hoisted(() => vi.fn());
const decryptNotificationSecret = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications/message-store", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateNotificationDeliveryResult,
}));

vi.mock("@/lib/edge/system-config", () => ({
  readConfig,
}));

vi.mock("@/lib/edge/secret-encryption", () => ({
  decryptNotificationSecret,
}));

function message(): NotificationMessage {
  return {
    id: "msg-1",
    teamId: "team-1",
    siteId: null,
    userId: "user-1",
    ruleId: null,
    runId: "run-1",
    batchId: null,
    type: "test",
    severity: "info",
    requiresAttention: false,
    title: "Test",
    summary: "Summary",
    bodyText: "Body",
    bodyHtml: "",
    data: {},
    channels: {},
    deliveryStatus: "created",
    deliveryResults: {},
    errorMessage: "",
    readAt: null,
    dismissedAt: null,
    archivedAt: null,
    triggeredAt: null,
    createdAt: 1,
    updatedAt: 1,
    sentAt: null,
    failedAt: null,
    expiresAt: null,
  };
}

describe("notification delivery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    updateNotificationDeliveryResult.mockResolvedValue(message());
  });

  it("marks delivery sent when user disables email", async () => {
    await deliverNotificationMessage(
      {} as never,
      message(),
      {
        id: "user-1",
        email: "user@example.test",
        preferencesJson: JSON.stringify({ email: false }),
      },
      {},
    );

    expect(updateNotificationDeliveryResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        messageId: "msg-1",
        status: "sent",
        deliveryResults: expect.objectContaining({
          email: {
            status: "skipped",
            reason: "user_preference_disabled",
          },
        }),
      }),
    );
  });

  it("marks delivery sent when system email is unconfigured", async () => {
    readConfig.mockResolvedValue(null);

    await deliverNotificationMessage(
      {} as never,
      message(),
      {
        id: "user-1",
        email: "user@example.test",
        preferencesJson: "{}",
      },
      {},
    );

    expect(updateNotificationDeliveryResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "sent",
        deliveryResults: expect.objectContaining({
          email: {
            status: "skipped",
            reason: "system_email_unconfigured",
          },
        }),
      }),
    );
  });

  it("marks delivery failed when Resend rejects the request", async () => {
    readConfig.mockResolvedValue({
      enabled: true,
      provider: "resend",
      fromEmail: "from@example.test",
      fromName: "InsightFlare",
      replyTo: "",
      resend: {
        configured: true,
        apiKeyEncrypted: "encrypted",
      },
    });
    decryptNotificationSecret.mockResolvedValue("re_secret");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "invalid_from" }), {
        status: 400,
      }),
    );

    await deliverNotificationMessage(
      {} as never,
      message(),
      {
        id: "user-1",
        email: "user@example.test",
        preferencesJson: "{}",
      },
      {},
    );

    expect(updateNotificationDeliveryResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "failed",
        errorMessage: "invalid_from",
      }),
    );
  });
});
