import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/admin/site-config/route";
import { upsertAdminSiteConfig } from "@/lib/edge-client";

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
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "missing_site_id", message: "Missing site ID" },
    });
    expect(upsertAdminSiteConfigMock).not.toHaveBeenCalled();
  });

  it("persists explicit config objects", async () => {
    upsertAdminSiteConfigMock.mockResolvedValue({ saved: true } as any);

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
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { saved: true },
    });
  });

  it("builds legacy privacy config from form booleans", async () => {
    upsertAdminSiteConfigMock.mockResolvedValue({ saved: true } as any);

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

  it("uses default legacy privacy settings when form booleans are absent", async () => {
    upsertAdminSiteConfigMock.mockResolvedValue({ saved: true } as any);

    await POST(jsonRequest({ siteId: "site-1" }));

    expect(upsertAdminSiteConfigMock).toHaveBeenCalledWith({
      siteId: "site-1",
      config: {
        privacy: {
          maskQueryHashDetails: true,
          maskVisitorTrajectory: true,
          maskDetailedReferrerUrl: true,
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
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "save_site_config_failed", message: "Invalid config" },
    });
  });

  it("prefers upstream message fields and falls back to raw errors", async () => {
    upsertAdminSiteConfigMock.mockRejectedValueOnce(
      new Error('Edge API failed (400): {"message":"Config is too large"}'),
    );

    const messageField = await POST(
      jsonRequest({ siteId: "site-1", config: {} }),
    );

    expect(messageField.status).toBe(500);
    expect(await messageField.json()).toMatchObject({
      ok: false,
      error: {
        code: "save_site_config_failed",
        message: "Config is too large",
      },
    });

    upsertAdminSiteConfigMock.mockRejectedValueOnce(new Error("network down"));

    const rawFallback = await POST(
      jsonRequest({ siteId: "site-1", config: {} }),
    );

    expect(rawFallback.status).toBe(500);
    expect(await rawFallback.json()).toMatchObject({
      ok: false,
      error: { code: "save_site_config_failed", message: "network down" },
    });
  });

  it("falls back when config errors have no useful JSON details", async () => {
    upsertAdminSiteConfigMock.mockRejectedValueOnce(
      'Edge API failed (500): {"message":"","error":""}',
    );

    const response = await POST(jsonRequest({ siteId: "site-1", config: {} }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: "save_site_config_failed",
        message: 'Edge API failed (500): {"message":"","error":""}',
      },
    });
  });
});
