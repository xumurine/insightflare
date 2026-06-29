import { describe, expect, it } from "vitest";

import {
  isNotificationChannelEnabled,
  normalizeNotificationPreferences,
} from "@/lib/notifications/preferences";

describe("notification preferences", () => {
  it("normalizes invalid input to safe defaults and keeps in-app enabled", () => {
    const preferences = normalizeNotificationPreferences("{bad json");

    expect(preferences.inApp).toBe(true);
    expect(preferences.email).toBe(true);
    expect(preferences.webPush).toBe(false);
    expect(isNotificationChannelEnabled(preferences, "inApp")).toBe(true);
  });

  it("honors email opt-out without allowing in-app opt-out", () => {
    const preferences = normalizeNotificationPreferences({
      inApp: false,
      email: false,
      attention: {
        reportsCreateUnread: true,
      },
    });

    expect(preferences.inApp).toBe(true);
    expect(preferences.email).toBe(false);
    expect(isNotificationChannelEnabled(preferences, "email")).toBe(false);
    expect(preferences.attention.reportsCreateUnread).toBe(true);
    expect(preferences.attention.alertsCreateUnread).toBe(true);
  });
});
