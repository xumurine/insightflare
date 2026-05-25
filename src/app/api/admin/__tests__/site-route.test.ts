import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAdminSite,
  removeAdminSite,
  updateAdminSite,
} from "@/lib/edge-client";

import { POST } from "../site/route";

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
    createAdminSiteMock.mockResolvedValue({ id: "site-1" });

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

  it("updates and removes sites by intent", async () => {
    updateAdminSiteMock.mockResolvedValue({ updated: true });
    removeAdminSiteMock.mockResolvedValue({ removed: true });

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
});
