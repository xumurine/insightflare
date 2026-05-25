import { beforeEach, describe, expect, it, vi } from "vitest";

import { upsertAdminSiteConfig } from "@/lib/edge-client";

import { POST } from "../site-config/route";

vi.mock("@/lib/edge-client", () => ({
  upsertAdminSiteConfig: vi.fn(),
}));

const upsertAdminSiteConfigMock = vi.mocked(upsertAdminSiteConfig);

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("https://app.test/api/admin/site-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin site config route", () => {
  beforeEach(() => {
    upsertAdminSiteConfigMock.mockReset();
  });

  it("rejects missing site ids", async () => {
    const response = await POST(jsonRequest({ config: {} }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "missing_site_id",
    });
    expect(upsertAdminSiteConfigMock).not.toHaveBeenCalled();
  });

  it("persists explicit config objects", async () => {
    upsertAdminSiteConfigMock.mockResolvedValue({ saved: true });

    const response = await POST(
      jsonRequest({
        siteId: " site-1 ",
        config: {
          tracking: { trackHash: false },
        },
      }),
    );

    expect(upsertAdminSiteConfigMock).toHaveBeenCalledWith({
      siteId: "site-1",
      config: {
        tracking: { trackHash: false },
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { saved: true },
    });
  });

  it("builds legacy privacy config from form booleans", async () => {
    upsertAdminSiteConfigMock.mockResolvedValue({ saved: true });

    await POST(
      jsonRequest({
        siteId: "site-1",
        maskQueryHashDetails: "false",
        maskVisitorTrajectory: "yes",
        maskDetailedReferrerUrl: "0",
      }),
    );

    expect(upsertAdminSiteConfigMock).toHaveBeenCalledWith({
      siteId: "site-1",
      config: {
        privacy: {
          maskQueryHashDetails: false,
          maskVisitorTrajectory: true,
          maskDetailedReferrerUrl: false,
        },
      },
    });
  });

  it("extracts upstream error details", async () => {
    upsertAdminSiteConfigMock.mockRejectedValue(
      new Error('Edge API failed (400): {"error":"Invalid config"}'),
    );

    const response = await POST(jsonRequest({ siteId: "site-1", config: {} }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "save_site_config_failed",
      message: "Invalid config",
    });
  });
});
