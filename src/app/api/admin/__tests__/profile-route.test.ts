import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateMyProfile } from "@/lib/edge-client";

import { POST } from "../profile/route";

vi.mock("@/lib/edge-client", () => ({
  updateMyProfile: vi.fn(),
}));

const updateMyProfileMock = vi.mocked(updateMyProfile);

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("https://app.test/api/admin/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin profile route", () => {
  beforeEach(() => {
    updateMyProfileMock.mockReset();
  });

  it("normalizes profile fields and returns the saved profile", async () => {
    updateMyProfileMock.mockResolvedValue({
      id: "user-1",
      username: "admin",
      email: "admin@example.test",
      name: "Admin User",
      systemRole: "admin",
      timeZone: "Asia/Shanghai",
      createdAt: 1,
      updatedAt: 2,
    });

    const response = await POST(
      jsonRequest({
        username: " admin ",
        email: " admin@example.test ",
        name: " Admin User ",
        currentPassword: " old ",
        password: " new ",
        timeZone: " Asia/Shanghai ",
      }),
    );

    expect(updateMyProfileMock).toHaveBeenCalledWith({
      username: "admin",
      email: "admin@example.test",
      name: "Admin User",
      currentPassword: "old",
      password: "new",
      timeZone: "Asia/Shanghai",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        id: "user-1",
        username: "admin",
        email: "admin@example.test",
        name: "Admin User",
        systemRole: "admin",
        timeZone: "Asia/Shanghai",
        createdAt: 1,
        updatedAt: 2,
      },
    });
  });

  it("omits absent optional fields and preserves explicitly empty name", async () => {
    updateMyProfileMock.mockResolvedValue({ updated: true });

    await POST(
      jsonRequest({
        username: "",
        name: "",
      }),
    );

    expect(updateMyProfileMock).toHaveBeenCalledWith({
      username: undefined,
      email: undefined,
      name: "",
      currentPassword: undefined,
      password: undefined,
    });
  });

  it("extracts useful messages from upstream JSON errors", async () => {
    updateMyProfileMock.mockRejectedValue(
      new Error('Edge API failed (500): {"message":"Name is required"}'),
    );

    const response = await POST(jsonRequest({ username: "admin" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "profile_update_failed",
      message: "Name is required",
    });
  });
});
