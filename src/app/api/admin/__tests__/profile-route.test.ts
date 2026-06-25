import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/admin/profile/route";
import { updateMyProfile } from "@/lib/edge-client";

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
    expect(await response.json()).toMatchObject({
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
    updateMyProfileMock.mockResolvedValue({ updated: true } as any);

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
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "profile_update_failed", message: "Name is required" },
    });
  });

  it("falls back to upstream error fields and raw messages", async () => {
    updateMyProfileMock.mockRejectedValueOnce(
      new Error('Edge API failed (400): {"error":"Email is invalid"}'),
    );

    const errorField = await POST(jsonRequest({ email: "bad" }));

    expect(errorField.status).toBe(500);
    expect(await errorField.json()).toMatchObject({
      ok: false,
      error: { code: "profile_update_failed", message: "Email is invalid" },
    });

    updateMyProfileMock.mockRejectedValueOnce(
      new Error('Edge API failed (500): {"message":'),
    );

    const rawFallback = await POST(jsonRequest({ username: "admin" }));

    expect(rawFallback.status).toBe(500);
    expect(await rawFallback.json()).toMatchObject({
      ok: false,
      error: {
        code: "profile_update_failed",
        message: 'Edge API failed (500): {"message":',
      },
    });
  });

  it("falls back when upstream errors have no useful JSON details", async () => {
    updateMyProfileMock.mockRejectedValueOnce(
      'Edge API failed (500): {"message":"","error":""}',
    );

    const emptyDetails = await POST(jsonRequest({ username: "admin" }));

    expect(emptyDetails.status).toBe(500);
    expect(await emptyDetails.json()).toMatchObject({
      ok: false,
      error: {
        code: "profile_update_failed",
        message: 'Edge API failed (500): {"message":"","error":""}',
      },
    });

    updateMyProfileMock.mockRejectedValueOnce("plain profile failure");

    const plainFailure = await POST(jsonRequest({ username: "admin" }));

    expect(plainFailure.status).toBe(500);
    expect(await plainFailure.json()).toMatchObject({
      ok: false,
      error: {
        code: "profile_update_failed",
        message: "plain profile failure",
      },
    });
  });
});
