import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/auth/login/route";
import { loginAdminAccount } from "@/lib/edge-client";
import { createSessionToken } from "@/lib/session";

vi.mock("@/lib/edge-client", () => ({
  loginAdminAccount: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  createSessionToken: vi.fn(),
}));

const loginAdminAccountMock = vi.mocked(loginAdminAccount);
const createSessionTokenMock = vi.mocked(createSessionToken);

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("https://app.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSuccessfulLogin(overrides: Record<string, unknown> = {}) {
  loginAdminAccountMock.mockResolvedValue({
    user: {
      id: "user-1",
      username: "admin",
      email: "admin@example.test",
      name: "Admin User",
      systemRole: "admin",
      createdAt: 1,
      updatedAt: 2,
      ...overrides,
    },
    teams: [],
  });
}

describe("auth login route", () => {
  beforeEach(() => {
    loginAdminAccountMock.mockReset();
    createSessionTokenMock.mockReset();
    createSessionTokenMock.mockResolvedValue("signed-session-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects malformed credentials before calling the edge API", async () => {
    const response = await POST(jsonRequest({ username: "a", password: "" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "invalid_credentials",
    });
    expect(loginAdminAccountMock).not.toHaveBeenCalled();
  });

  it("treats a missing password as malformed credentials", async () => {
    const response = await POST(jsonRequest({ username: "admin" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "invalid_credentials",
    });
    expect(loginAdminAccountMock).not.toHaveBeenCalled();
  });

  it("logs in, creates a session token, and sets the session cookie", async () => {
    mockSuccessfulLogin();

    const response = await POST(
      jsonRequest({
        username: " admin ",
        password: "secret",
        next: "/en/app/team?tab=members",
      }),
    );

    expect(loginAdminAccountMock).toHaveBeenCalledWith({
      username: "admin",
      password: "secret",
    });
    expect(createSessionTokenMock).toHaveBeenCalledWith(
      {
        userId: "user-1",
        username: "admin",
        displayName: "Admin User",
        systemRole: "admin",
      },
      60 * 60 * 24 * 30,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { next: "/en/app/team?tab=members" },
    });
    expect(response.headers.get("set-cookie")).toContain(
      "if_session=signed-session-token",
    );
  });

  it("marks the session cookie secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockSuccessfulLogin();

    const response = await POST(
      jsonRequest({ username: "admin", password: "secret" }),
    );

    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("falls back to /app for unsafe next paths", async () => {
    loginAdminAccountMock.mockResolvedValue({
      user: {
        id: "user-1",
        username: "admin",
        email: "admin@example.test",
        name: "",
        systemRole: "user",
        createdAt: 1,
        updatedAt: 2,
      },
      teams: [],
    });

    const response = await POST(
      jsonRequest({
        username: "admin",
        password: "secret",
        next: "//evil.example/login",
      }),
    );

    expect(await response.json()).toMatchObject({
      ok: true,
      data: { next: "/app" },
    });
    expect(createSessionTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "admin", systemRole: "user" }),
      expect.any(Number),
    );
  });

  it.each([
    ["external URL", "https://evil.example/app"],
    ["login page", "/login"],
    ["localized login page", "/en/login?from=%2Fapp"],
    ["blank value", ""],
  ])("normalizes unsafe next paths for %s", async (_label, next) => {
    mockSuccessfulLogin();

    const response = await POST(
      jsonRequest({
        username: "admin",
        password: "secret",
        next,
      }),
    );

    expect(await response.json()).toMatchObject({
      ok: true,
      data: { next: "/app" },
    });
  });

  it("maps upstream credential failures and other errors", async () => {
    loginAdminAccountMock.mockRejectedValueOnce(
      new Error("Edge API failed (401 POST /login): denied"),
    );

    const unauthorized = await POST(
      jsonRequest({ username: "admin", password: "bad" }),
    );

    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({
      ok: false,
      error: "invalid_credentials",
    });

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    loginAdminAccountMock.mockRejectedValueOnce(new Error("network down"));

    const failed = await POST(
      jsonRequest({ username: "admin", password: "secret" }),
    );

    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({
      ok: false,
      error: "login_upstream_failed",
      message: "network down",
    });
    expect(consoleError).toHaveBeenCalledWith("login_upstream_failed", {
      message: "network down",
    });
  });

  it("preserves non-credential upstream status codes and string errors", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    loginAdminAccountMock.mockRejectedValueOnce(
      new Error("Edge API failed (503 POST /login): unavailable"),
    );

    const upstreamFailed = await POST(
      jsonRequest({ username: "admin", password: "secret" }),
    );

    expect(upstreamFailed.status).toBe(503);
    expect(await upstreamFailed.json()).toEqual({
      ok: false,
      error: "login_upstream_failed",
      message: "Edge API failed (503 POST /login): unavailable",
    });

    loginAdminAccountMock.mockRejectedValueOnce("plain failure");

    const stringFailed = await POST(
      jsonRequest({ username: "admin", password: "secret" }),
    );

    expect(stringFailed.status).toBe(502);
    expect(await stringFailed.json()).toEqual({
      ok: false,
      error: "login_upstream_failed",
      message: "plain failure",
    });
    expect(consoleError).toHaveBeenCalledWith("login_upstream_failed", {
      message: "plain failure",
    });
  });
});
