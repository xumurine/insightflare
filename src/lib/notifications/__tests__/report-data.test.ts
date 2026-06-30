import { describe, expect, it, vi } from "vitest";

import { loadSiteLastSeenAt } from "@/lib/notifications/report-data";

function envWithLastSeen(lastSeenAt: number | null) {
  const bind = vi.fn(() => ({
    first: vi.fn(() => Promise.resolve({ lastSeenAt })),
  }));
  return {
    env: {
      DB: {
        prepare: vi.fn(() => ({ bind })),
      },
    },
    bind,
  };
}

describe("notification report data", () => {
  it("queries visits and visits_archive when loading site last seen time", async () => {
    const { env, bind } = envWithLastSeen(1_800_000_123_000);

    await expect(loadSiteLastSeenAt(env as never, "site-1")).resolves.toBe(
      1_800_000_123,
    );
    expect(bind).toHaveBeenCalledWith("site-1", "site-1");
  });

  it("returns the latest visits timestamp in seconds", async () => {
    const { env } = envWithLastSeen(1_800_000_100_000);

    await expect(loadSiteLastSeenAt(env as never, "site-1")).resolves.toBe(
      1_800_000_100,
    );
  });

  it("returns archive timestamps when live visits are empty", async () => {
    const { env } = envWithLastSeen(1_700_000_000_000);

    await expect(loadSiteLastSeenAt(env as never, "site-1")).resolves.toBe(
      1_700_000_000,
    );
  });

  it("returns null when neither table has data", async () => {
    const { env } = envWithLastSeen(null);

    await expect(
      loadSiteLastSeenAt(env as never, "site-1"),
    ).resolves.toBeNull();
  });
});
