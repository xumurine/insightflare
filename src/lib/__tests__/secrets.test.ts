import { describe, expect, it } from "vitest";

import {
  apiKeyHashSecret,
  dashboardSessionSecret,
  deriveSecret,
  rootSecret,
  SECRET_PURPOSES,
  visitorDailySaltSecret,
} from "@/lib/secrets";

describe("secret derivation", () => {
  it("uses MAIN_SECRET before DAILY_SALT_SECRET as the root secret", () => {
    expect(
      rootSecret({
        MAIN_SECRET: "main",
        DAILY_SALT_SECRET: "daily",
      }),
    ).toBe("main");
    expect(rootSecret({ DAILY_SALT_SECRET: "daily" })).toBe("daily");
  });

  it("derives different purpose-specific secrets from the same root", async () => {
    const root = "root-secret";

    await expect(dashboardSessionSecret({ MAIN_SECRET: root })).resolves.toBe(
      await deriveSecret(root, SECRET_PURPOSES.dashboardSession),
    );
    await expect(apiKeyHashSecret({ MAIN_SECRET: root })).resolves.toBe(
      await deriveSecret(root, SECRET_PURPOSES.apiKeyHash),
    );
    await expect(visitorDailySaltSecret({ MAIN_SECRET: root })).resolves.toBe(
      await deriveSecret(root, SECRET_PURPOSES.visitorDailySalt),
    );

    const values = await Promise.all([
      dashboardSessionSecret({ MAIN_SECRET: root }),
      apiKeyHashSecret({ MAIN_SECRET: root }),
      visitorDailySaltSecret({ MAIN_SECRET: root }),
    ]);
    expect(new Set(values).size).toBe(3);
  });

  it("keeps explicit session secrets as compatibility overrides", async () => {
    await expect(
      dashboardSessionSecret({
        MAIN_SECRET: "main",
        DASHBOARD_SESSION_SECRET: "session",
      }),
    ).resolves.toBe("session");
    await expect(
      dashboardSessionSecret({
        MAIN_SECRET: "main",
        SESSION_SECRET: "legacy-session",
      }),
    ).resolves.toBe("legacy-session");
  });
});
