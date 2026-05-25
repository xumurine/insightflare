import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/admin/site/route";
import {
  createAdminSite,
  removeAdminSite,
  updateAdminSite,
} from "@/lib/edge-client";

vi.mock("@/lib/edge-client", () => ({
  createAdminSite: vi.fn(),
  removeAdminSite: vi.fn(),
  updateAdminSite: vi.fn(),
}));

const createAdminSiteMock = vi.mocked(createAdminSite);
const removeAdminSiteMock = vi.mocked(removeAdminSite);
const updateAdminSiteMock = vi.mocked(updateAdminSite);

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("https://app.test/api/admin/site", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin site route", () => {
  beforeEach(() => {
    createAdminSiteMock.mockReset();
    removeAdminSiteMock.mockReset();
    updateAdminSiteMock.mockReset();
  });

  it("creates sites with normalized fields", async () => {
    createAdminSiteMock.mockResolvedValue({ id: "site-1" } as any);

    const response = await POST(
      jsonRequest({
        teamId: " team-1 ",
        name: " Docs ",
        domain: " docs.example.test ",
        publicEnabled: "on",
        publicSlug: " docs ",
      }),
    );

    expect(createAdminSiteMock).toHaveBeenCalledWith({
      teamId: "team-1",
      name: "Docs",
      domain: "docs.example.test",
      publicEnabled: true,
      publicSlug: "docs",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { id: "site-1" },
    });
  });

  it("rejects invalid create and remove inputs", async () => {
    const invalidCreate = await POST(
      jsonRequest({ teamId: "team-1", name: "", domain: "example.test" }),
    );
    expect(invalidCreate.status).toBe(400);
    expect(await invalidCreate.json()).toEqual({
      ok: false,
      error: "invalid_site_input",
    });

    const invalidRemove = await POST(jsonRequest({ intent: "remove" }));
    expect(invalidRemove.status).toBe(400);
    expect(await invalidRemove.json()).toEqual({
      ok: false,
      error: "missing_site_id",
    });
  });

  it("rejects update requests without a site id", async () => {
    const response = await POST(
      jsonRequest({ intent: "update", name: "Docs" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "missing_site_id",
    });
    expect(updateAdminSiteMock).not.toHaveBeenCalled();
  });

  it("updates and removes sites by intent", async () => {
    updateAdminSiteMock.mockResolvedValue({ updated: true } as any);
    removeAdminSiteMock.mockResolvedValue({ removed: true } as any);

    const updated = await POST(
      jsonRequest({
        intent: "update",
        siteId: "site-1",
        teamId: "",
        name: "Renamed",
        domain: "",
        publicEnabled: "false",
        publicSlug: "",
      }),
    );

    expect(updateAdminSiteMock).toHaveBeenCalledWith({
      siteId: "site-1",
      teamId: undefined,
      name: "Renamed",
      domain: undefined,
      publicEnabled: false,
      publicSlug: undefined,
    });
    expect(await updated.json()).toEqual({
      ok: true,
      data: { updated: true },
    });

    const removed = await POST(
      jsonRequest({ intent: "remove", siteId: "site-1" }),
    );

    expect(removeAdminSiteMock).toHaveBeenCalledWith({ siteId: "site-1" });
    expect(await removed.json()).toEqual({
      ok: true,
      data: { removed: true },
    });
  });

  it("normalizes upstream site mutation errors", async () => {
    createAdminSiteMock.mockRejectedValue(
      new Error('Edge API failed (409): {"error":"Domain already exists"}'),
    );

    const response = await POST(
      jsonRequest({
        teamId: "team-1",
        name: "Docs",
        domain: "docs.example.test",
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "site_mutation_failed",
      message: "Domain already exists",
    });
  });

  it("prefers upstream message fields and falls back to raw site errors", async () => {
    updateAdminSiteMock.mockRejectedValueOnce(
      new Error('Edge API failed (409): {"message":"Slug already exists"}'),
    );

    const messageField = await POST(
      jsonRequest({ intent: "update", siteId: "site-1" }),
    );

    expect(messageField.status).toBe(500);
    expect(await messageField.json()).toEqual({
      ok: false,
      error: "site_mutation_failed",
      message: "Slug already exists",
    });

    removeAdminSiteMock.mockRejectedValueOnce(new Error("delete failed"));

    const rawFallback = await POST(
      jsonRequest({ intent: "remove", siteId: "site-1" }),
    );

    expect(rawFallback.status).toBe(500);
    expect(await rawFallback.json()).toEqual({
      ok: false,
      error: "site_mutation_failed",
      message: "delete failed",
    });
  });

  it("falls back when site errors have no useful JSON details", async () => {
    createAdminSiteMock.mockRejectedValueOnce(
      'Edge API failed (500): {"message":"","error":""}',
    );

    const response = await POST(
      jsonRequest({
        teamId: "team-1",
        name: "Docs",
        domain: "docs.example.test",
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "site_mutation_failed",
      message: 'Edge API failed (500): {"message":"","error":""}',
    });
  });
});
