import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAdminTeam,
  removeAdminTeam,
  transferAdminTeamOwner,
  updateAdminTeam,
} from "@/lib/edge-client";

import { POST } from "../team/route";

vi.mock("@/lib/edge-client", () => ({
  createAdminTeam: vi.fn(),
  removeAdminTeam: vi.fn(),
  transferAdminTeamOwner: vi.fn(),
  updateAdminTeam: vi.fn(),
}));

const createAdminTeamMock = vi.mocked(createAdminTeam);
const removeAdminTeamMock = vi.mocked(removeAdminTeam);
const transferAdminTeamOwnerMock = vi.mocked(transferAdminTeamOwner);
const updateAdminTeamMock = vi.mocked(updateAdminTeam);

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("https://app.test/api/admin/team", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin team route", () => {
  beforeEach(() => {
    createAdminTeamMock.mockReset();
    removeAdminTeamMock.mockReset();
    transferAdminTeamOwnerMock.mockReset();
    updateAdminTeamMock.mockReset();
  });

  it("creates teams with trimmed optional slugs", async () => {
    createAdminTeamMock.mockResolvedValue({ id: "team-1", name: "Docs" });

    const response = await POST(
      jsonRequest({ name: " Docs ", slug: " docs-team " }),
    );

    expect(createAdminTeamMock).toHaveBeenCalledWith({
      name: "Docs",
      slug: "docs-team",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { id: "team-1", name: "Docs" },
    });
  });

  it("updates existing teams when team id is present", async () => {
    updateAdminTeamMock.mockResolvedValue({ id: "team-1", updated: true });

    const response = await POST(
      jsonRequest({ teamId: " team-1 ", name: " Renamed ", slug: "" }),
    );

    expect(updateAdminTeamMock).toHaveBeenCalledWith({
      teamId: "team-1",
      name: "Renamed",
      slug: undefined,
    });
    expect(await response.json()).toEqual({
      ok: true,
      data: { id: "team-1", updated: true },
    });
  });

  it("removes teams for remove and delete intents", async () => {
    removeAdminTeamMock.mockResolvedValue({ teamId: "team-1", removed: true });

    const response = await POST(
      jsonRequest({ intent: "delete", teamId: "team-1" }),
    );

    expect(removeAdminTeamMock).toHaveBeenCalledWith({ teamId: "team-1" });
    expect(await response.json()).toEqual({
      ok: true,
      data: { teamId: "team-1", removed: true },
    });
  });

  it("transfers team ownership when required inputs are present", async () => {
    transferAdminTeamOwnerMock.mockResolvedValue({
      id: "team-1",
      transferred: true,
    });

    const response = await POST(
      jsonRequest({
        intent: "transfer_owner",
        teamId: "team-1",
        newOwnerUserId: "user-2",
      }),
    );

    expect(transferAdminTeamOwnerMock).toHaveBeenCalledWith({
      teamId: "team-1",
      newOwnerUserId: "user-2",
    });
    expect(await response.json()).toEqual({
      ok: true,
      data: { id: "team-1", transferred: true },
    });
  });

  it("rejects invalid inputs before mutation calls", async () => {
    const invalidName = await POST(jsonRequest({ name: "A" }));
    expect(invalidName.status).toBe(400);
    expect(await invalidName.json()).toEqual({
      ok: false,
      error: "invalid_team_name",
    });

    const missingTeamId = await POST(jsonRequest({ intent: "remove" }));
    expect(missingTeamId.status).toBe(400);
    expect(await missingTeamId.json()).toEqual({
      ok: false,
      error: "missing_team_id",
    });

    const missingTransferInput = await POST(
      jsonRequest({ intent: "transfer_owner", teamId: "team-1" }),
    );
    expect(missingTransferInput.status).toBe(400);
    expect(await missingTransferInput.json()).toEqual({
      ok: false,
      error: "missing_transfer_input",
    });
  });

  it("normalizes upstream team mutation errors", async () => {
    updateAdminTeamMock.mockRejectedValue(
      new Error('Edge API failed (409): {"message":"Slug already exists"}'),
    );

    const response = await POST(
      jsonRequest({ teamId: "team-1", name: "Docs" }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "update_team_failed",
      message: "Slug already exists",
    });
  });
});
