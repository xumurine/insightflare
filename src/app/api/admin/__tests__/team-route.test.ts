import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/admin/team/route";
import {
  createAdminTeam,
  removeAdminTeam,
  transferAdminTeamOwner,
  updateAdminTeam,
} from "@/lib/edge-client";

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
    createAdminTeamMock.mockResolvedValue({
      id: "team-1",
      name: "Docs",
    } as any);

    const response = await POST(
      jsonRequest({ name: " Docs ", slug: " docs-team " }),
    );

    expect(createAdminTeamMock).toHaveBeenCalledWith({
      name: "Docs",
      slug: "docs-team",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { id: "team-1", name: "Docs" },
    });
  });

  it("updates existing teams when team id is present", async () => {
    updateAdminTeamMock.mockResolvedValue({
      id: "team-1",
      updated: true,
    } as any);

    const response = await POST(
      jsonRequest({ teamId: " team-1 ", name: " Renamed ", slug: "" }),
    );

    expect(updateAdminTeamMock).toHaveBeenCalledWith({
      teamId: "team-1",
      name: "Renamed",
      slug: undefined,
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { id: "team-1", updated: true },
    });
  });

  it("removes teams for remove and delete intents", async () => {
    removeAdminTeamMock.mockResolvedValue({
      teamId: "team-1",
      removed: true,
    } as any);

    const response = await POST(
      jsonRequest({ intent: "delete", teamId: "team-1" }),
    );

    expect(removeAdminTeamMock).toHaveBeenCalledWith({ teamId: "team-1" });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { teamId: "team-1", removed: true },
    });
  });

  it("transfers team ownership when required inputs are present", async () => {
    transferAdminTeamOwnerMock.mockResolvedValue({
      id: "team-1",
      transferred: true,
    } as any);

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
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { id: "team-1", transferred: true },
    });
  });

  it("rejects invalid inputs before mutation calls", async () => {
    const invalidName = await POST(jsonRequest({ name: "A" }));
    expect(invalidName.status).toBe(400);
    expect(await invalidName.json()).toMatchObject({
      ok: false,
      error: { code: "invalid_team_name", message: "Invalid team name" },
    });

    const missingTeamId = await POST(jsonRequest({ intent: "remove" }));
    expect(missingTeamId.status).toBe(400);
    expect(await missingTeamId.json()).toMatchObject({
      ok: false,
      error: { code: "missing_team_id", message: "Missing team ID" },
    });

    const missingTransferInput = await POST(
      jsonRequest({ intent: "transfer_owner", teamId: "team-1" }),
    );
    expect(missingTransferInput.status).toBe(400);
    expect(await missingTransferInput.json()).toMatchObject({
      ok: false,
      error: {
        code: "missing_transfer_input",
        message: "Missing transfer input",
      },
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
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "update_team_failed", message: "Slug already exists" },
    });
  });

  it("normalizes transfer, remove, and create team failures", async () => {
    transferAdminTeamOwnerMock.mockRejectedValueOnce(
      new Error('Edge API failed (403): {"error":"Not allowed"}'),
    );

    const transfer = await POST(
      jsonRequest({
        intent: "transfer_owner",
        teamId: "team-1",
        newOwnerUserId: "user-2",
      }),
    );

    expect(transfer.status).toBe(500);
    expect(await transfer.json()).toMatchObject({
      ok: false,
      error: { code: "transfer_team_failed", message: "Not allowed" },
    });

    removeAdminTeamMock.mockRejectedValueOnce(new Error("remove failed"));

    const remove = await POST(
      jsonRequest({ intent: "remove", teamId: "team-1" }),
    );

    expect(remove.status).toBe(500);
    expect(await remove.json()).toMatchObject({
      ok: false,
      error: { code: "remove_team_failed", message: "remove failed" },
    });

    createAdminTeamMock.mockRejectedValueOnce(new Error("create failed"));

    const create = await POST(jsonRequest({ name: "Docs" }));

    expect(create.status).toBe(500);
    expect(await create.json()).toMatchObject({
      ok: false,
      error: { code: "create_team_failed", message: "create failed" },
    });
  });

  it("falls back when team errors have no useful JSON details", async () => {
    createAdminTeamMock.mockRejectedValueOnce(
      'Edge API failed (500): {"message":"","error":""}',
    );

    const response = await POST(jsonRequest({ name: "Docs" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: "create_team_failed",
        message: 'Edge API failed (500): {"message":"","error":""}',
      },
    });
  });
});
