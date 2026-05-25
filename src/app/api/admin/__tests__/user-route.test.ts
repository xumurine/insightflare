import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/admin/user/route";
import {
  createAdminUser,
  removeAdminUser,
  updateAdminUser,
} from "@/lib/edge-client";

vi.mock("@/lib/edge-client", () => ({
  createAdminUser: vi.fn(),
  removeAdminUser: vi.fn(),
  updateAdminUser: vi.fn(),
}));

const createAdminUserMock = vi.mocked(createAdminUser);
const removeAdminUserMock = vi.mocked(removeAdminUser);
const updateAdminUserMock = vi.mocked(updateAdminUser);

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("https://app.test/api/admin/user", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin user route", () => {
  beforeEach(() => {
    createAdminUserMock.mockReset();
    removeAdminUserMock.mockReset();
    updateAdminUserMock.mockReset();
  });

  it("creates users with trimmed fields and normalized roles", async () => {
    createAdminUserMock.mockResolvedValue({ id: "user-1" } as any);

    const response = await POST(
      jsonRequest({
        username: " admin ",
        email: " admin@example.test ",
        name: " Admin User ",
        password: "supersecret",
        systemRole: "ADMIN",
      }),
    );

    expect(createAdminUserMock).toHaveBeenCalledWith({
      username: "admin",
      email: "admin@example.test",
      password: "supersecret",
      name: "Admin User",
      systemRole: "admin",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { id: "user-1" },
    });
  });

  it("rejects invalid create and missing id mutation inputs", async () => {
    const invalidCreate = await POST(
      jsonRequest({
        username: "admin",
        email: "admin@example.test",
        password: "short",
      }),
    );
    expect(invalidCreate.status).toBe(400);
    expect(await invalidCreate.json()).toEqual({
      ok: false,
      error: "invalid_user_input",
    });

    const missingPassword = await POST(
      jsonRequest({
        username: "admin",
        email: "admin@example.test",
      }),
    );
    expect(missingPassword.status).toBe(400);
    expect(await missingPassword.json()).toEqual({
      ok: false,
      error: "invalid_user_input",
    });

    const missingUpdateId = await POST(jsonRequest({ intent: "update" }));
    expect(missingUpdateId.status).toBe(400);
    expect(await missingUpdateId.json()).toEqual({
      ok: false,
      error: "missing_user_id",
    });

    const missingRemoveId = await POST(jsonRequest({ intent: "remove" }));
    expect(missingRemoveId.status).toBe(400);
    expect(await missingRemoveId.json()).toEqual({
      ok: false,
      error: "missing_user_id",
    });
  });

  it("updates users and omits empty optional fields", async () => {
    updateAdminUserMock.mockResolvedValue({
      id: "user-1",
      updated: true,
    } as any);

    const response = await POST(
      jsonRequest({
        intent: "update",
        userId: " user-1 ",
        username: "",
        email: " new@example.test ",
        name: "",
        password: "",
        systemRole: "member",
      }),
    );

    expect(updateAdminUserMock).toHaveBeenCalledWith({
      userId: "user-1",
      username: undefined,
      email: "new@example.test",
      name: undefined,
      password: undefined,
      systemRole: "user",
    });
    expect(await response.json()).toEqual({
      ok: true,
      data: { id: "user-1", updated: true },
    });
  });

  it("removes users by remove or delete intent", async () => {
    removeAdminUserMock.mockResolvedValue({
      userId: "user-1",
      removed: true,
    } as any);

    const response = await POST(
      jsonRequest({ intent: "delete", userId: "user-1" }),
    );

    expect(removeAdminUserMock).toHaveBeenCalledWith({ userId: "user-1" });
    expect(await response.json()).toEqual({
      ok: true,
      data: { userId: "user-1", removed: true },
    });
  });

  it("normalizes upstream user mutation errors", async () => {
    createAdminUserMock.mockRejectedValue(
      new Error('Edge API failed (409): {"error":"Username exists"}'),
    );

    const response = await POST(
      jsonRequest({
        username: "admin",
        email: "admin@example.test",
        password: "supersecret",
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "user_mutation_failed",
      message: "Username exists",
    });
  });

  it("prefers upstream message fields and falls back to raw user errors", async () => {
    updateAdminUserMock.mockRejectedValueOnce(
      new Error('Edge API failed (409): {"message":"Email exists"}'),
    );

    const messageField = await POST(
      jsonRequest({
        intent: "update",
        userId: "user-1",
        systemRole: "admin",
      }),
    );

    expect(updateAdminUserMock).toHaveBeenCalledWith({
      userId: "user-1",
      username: undefined,
      email: undefined,
      name: undefined,
      password: undefined,
      systemRole: "admin",
    });
    expect(messageField.status).toBe(500);
    expect(await messageField.json()).toEqual({
      ok: false,
      error: "user_mutation_failed",
      message: "Email exists",
    });

    removeAdminUserMock.mockRejectedValueOnce(new Error("remove failed"));

    const rawFallback = await POST(
      jsonRequest({ intent: "remove", userId: "user-1" }),
    );

    expect(rawFallback.status).toBe(500);
    expect(await rawFallback.json()).toEqual({
      ok: false,
      error: "user_mutation_failed",
      message: "remove failed",
    });
  });

  it("falls back when user errors have no useful JSON details", async () => {
    createAdminUserMock.mockRejectedValueOnce(
      'Edge API failed (500): {"message":"","error":""}',
    );

    const response = await POST(
      jsonRequest({
        username: "admin",
        email: "admin@example.test",
        password: "supersecret",
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "user_mutation_failed",
      message: 'Edge API failed (500): {"message":"","error":""}',
    });
  });
});
