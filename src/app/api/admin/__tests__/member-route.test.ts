import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addAdminMember,
  removeAdminMember,
  updateAdminMemberRole,
} from "@/lib/edge-client";

import { POST } from "../member/route";

vi.mock("@/lib/edge-client", () => ({
  addAdminMember: vi.fn(),
  removeAdminMember: vi.fn(),
  updateAdminMemberRole: vi.fn(),
}));

const addAdminMemberMock = vi.mocked(addAdminMember);
const removeAdminMemberMock = vi.mocked(removeAdminMember);
const updateAdminMemberRoleMock = vi.mocked(updateAdminMemberRole);

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("https://app.test/api/admin/member", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin member route", () => {
  beforeEach(() => {
    addAdminMemberMock.mockReset();
    removeAdminMemberMock.mockReset();
    updateAdminMemberRoleMock.mockReset();
  });

  it("adds members with normalized optional roles", async () => {
    addAdminMemberMock.mockResolvedValue({ id: "membership-1" });

    const response = await POST(
      jsonRequest({
        teamId: " team-1 ",
        identifier: " user@example.test ",
        role: "ADMIN",
      }),
    );

    expect(addAdminMemberMock).toHaveBeenCalledWith({
      teamId: "team-1",
      identifier: "user@example.test",
      role: "admin",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { id: "membership-1" },
    });
  });

  it("rejects invalid add inputs and owner role assignment", async () => {
    const invalidIdentifier = await POST(
      jsonRequest({ teamId: "team-1", identifier: "a" }),
    );
    expect(invalidIdentifier.status).toBe(400);
    expect(await invalidIdentifier.json()).toEqual({
      ok: false,
      error: "invalid_member_input",
    });

    const ownerRole = await POST(
      jsonRequest({
        teamId: "team-1",
        identifier: "user@example.test",
        role: "owner",
      }),
    );
    expect(ownerRole.status).toBe(400);
    expect(addAdminMemberMock).not.toHaveBeenCalled();
  });

  it("removes members when intent is remove", async () => {
    removeAdminMemberMock.mockResolvedValue({ removed: true });

    const response = await POST(
      jsonRequest({
        intent: "remove",
        teamId: "team-1",
        userId: "user-1",
      }),
    );

    expect(removeAdminMemberMock).toHaveBeenCalledWith({
      teamId: "team-1",
      userId: "user-1",
    });
    expect(await response.json()).toEqual({
      ok: true,
      data: { removed: true },
    });
  });

  it("updates non-owner member roles", async () => {
    updateAdminMemberRoleMock.mockResolvedValue({ role: "member" });

    const response = await POST(
      jsonRequest({
        intent: "update_role",
        teamId: "team-1",
        userId: "user-1",
        role: "member",
      }),
    );

    expect(updateAdminMemberRoleMock).toHaveBeenCalledWith({
      teamId: "team-1",
      userId: "user-1",
      role: "member",
    });
    expect(await response.json()).toEqual({
      ok: true,
      data: { role: "member" },
    });
  });

  it("normalizes upstream error messages for member mutations", async () => {
    removeAdminMemberMock.mockRejectedValue(
      new Error('Edge API failed (500): {"message":"Cannot remove owner"}'),
    );

    const response = await POST(
      jsonRequest({
        intent: "remove",
        teamId: "team-1",
        userId: "user-1",
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "remove_member_failed",
      message: "Cannot remove owner",
    });
  });
});
