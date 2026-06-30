import type { NotificationMessage } from "@/lib/notifications/message-store";

function baseMessage(
  input: Partial<NotificationMessage> & Pick<NotificationMessage, "type">,
): NotificationMessage {
  return {
    id: `preview-${input.type}`,
    teamId: "team-preview",
    siteId: "site-preview",
    userId: "user-preview",
    ruleId: "rule-preview",
    runId: null,
    batchId: "batch-preview",
    type: input.type,
    severity: input.severity ?? "info",
    requiresAttention: input.requiresAttention ?? false,
    title: input.title ?? "InsightFlare notification",
    summary: input.summary ?? "Preview notification",
    bodyText: input.bodyText ?? "Preview notification body.",
    bodyHtml: "",
    data: input.data ?? {},
    channels: { inApp: true },
    deliveryStatus: "created",
    deliveryResults: {},
    errorMessage: "",
    readAt: null,
    dismissedAt: null,
    archivedAt: null,
    triggeredAt: 1782691200,
    createdAt: 1782691200,
    updatedAt: 1782691200,
    sentAt: null,
    failedAt: null,
    expiresAt: null,
  };
}

export const notificationEmailPreviewMessages = {
  test: baseMessage({
    type: "test",
    title: "InsightFlare notification test",
    summary: "This is a test notification from InsightFlare.",
    bodyText:
      "This is a test notification from InsightFlare. If email is configured and enabled, this message also verifies Resend delivery.",
    data: { source: "preview" },
  }),
  report: baseMessage({
    type: "report",
    title: "example.com daily traffic report",
    data: {
      siteDomain: "example.com",
      range: { label: "2026-06-29" },
      metrics: { views: 3820, visitors: 1240, sessions: 1510 },
      topPages: [
        { path: "/", views: 1200 },
        { path: "/pricing", views: 420 },
      ],
      topReferrers: [
        { referrer: "Google", visits: 520 },
        { referrer: "Direct", visits: 160 },
      ],
    },
  }),
  threshold: baseMessage({
    type: "threshold",
    severity: "warning",
    requiresAttention: true,
    data: {
      siteDomain: "example.com",
      metric: "visitors",
      window: "last_1h",
      value: 1240,
      operator: ">=",
      target: 1000,
    },
  }),
  health: baseMessage({
    type: "health",
    severity: "critical",
    requiresAttention: true,
    data: {
      siteDomain: "example.com",
      hours: 12,
      lastSeenAt: null,
    },
  }),
};
