import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireActor } from "@/lib/edge/admin-auth";
import {
  handleNotificationEmailConfigAdmin,
  handleNotificationEmailTestAdmin,
} from "@/lib/edge/admin-notification-email";
import {
  decryptNotificationSecret,
  encryptNotificationSecret,
} from "@/lib/edge/secret-encryption";
import type { Env } from "@/lib/edge/types";
import type { NotificationEmailConfig } from "@/lib/notifications/email-config";

vi.mock("@/lib/edge/admin-auth", () => ({
  requireActor: vi.fn(),
}));

interface MockStatement {
  bind: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

const actor = {
  user: {
    id: "admin-1",
    username: "admin",
    email: "admin@example.test",
    name: "Admin",
    password_hash: null,
    system_role: "admin",
    timezone: "UTC",
    created_at: 1,
    updated_at: 1,
  },
  isAdmin: true,
};

function request(init?: RequestInit): Request {
  return new Request("https://app.test/api/private/admin/notification-email", {
    method: "GET",
    ...init,
  });
}

function jsonRequest(body: unknown, method: "POST" | "PATCH" = "PATCH") {
  return request({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function statement(options: { first?: unknown } = {}): MockStatement {
  const stmt = {
    bind: vi.fn(function (this: MockStatement) {
      return this;
    }),
    first: vi.fn().mockResolvedValue(options.first ?? null),
    run: vi.fn().mockResolvedValue({ success: true }),
  };
  return stmt;
}

function createEnv(statements: MockStatement[], extras: Partial<Env> = {}) {
  let index = 0;
  return {
    MAIN_SECRET: "main-secret",
    DB: {
      prepare: vi.fn(() => {
        const stmt = statements[index];
        index += 1;
        if (!stmt) throw new Error(`Unexpected SQL #${index}`);
        return stmt;
      }),
    } as unknown as D1Database,
    ...extras,
  } as Env;
}

function row(config: Partial<NotificationEmailConfig>) {
  return {
    value_json: JSON.stringify({
      version: 1,
      enabled: false,
      provider: "resend",
      fromName: "InsightFlare",
      fromEmail: "",
      replyTo: "",
      resend: {
        apiKeyEncrypted: "",
        apiKeyHint: "",
        configured: false,
      },
      updatedAt: 0,
      updatedByUserId: "",
      ...config,
    }),
  };
}

async function jsonOf(response: Response) {
  return (await response.json()) as Record<string, any>;
}

describe("admin notification email handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActor).mockResolvedValue(actor);
  });

  it("passes through unauthorized actor responses and rejects non-admins", async () => {
    const unauthorized = new Response("unauthorized", { status: 401 });
    vi.mocked(requireActor).mockResolvedValueOnce(unauthorized);
    await expect(
      handleNotificationEmailConfigAdmin(request(), createEnv([])),
    ).resolves.toBe(unauthorized);

    vi.mocked(requireActor).mockResolvedValueOnce({ ...actor, isAdmin: false });
    const response = await handleNotificationEmailConfigAdmin(
      request(),
      createEnv([]),
    );
    expect(response.status).toBe(403);
  });

  it("returns default redacted config for GET", async () => {
    const response = await handleNotificationEmailConfigAdmin(
      request(),
      createEnv([statement()]),
    );
    const body = await jsonOf(response);
    expect(body.ok).toBe(true);
    expect(body.data.resend.configured).toBe(false);
    expect(JSON.stringify(body)).not.toContain("apiKeyEncrypted");
  });

  it("saves a new Resend API key with DAILY_SALT_SECRET fallback and redacts response", async () => {
    const select = statement();
    const upsert = statement();
    const env = createEnv([select, upsert], {
      MAIN_SECRET: "",
      DAILY_SALT_SECRET: "daily-secret",
    });

    const response = await handleNotificationEmailConfigAdmin(
      jsonRequest({
        enabled: true,
        provider: "resend",
        fromEmail: "noreply@example.test",
        resendApiKey: "re_secret_1234",
      }),
      env,
    );
    const body = await jsonOf(response);
    expect(response.status).toBe(200);
    expect(body.data.resend).toEqual({
      configured: true,
      apiKeyHint: "••••1234",
    });
    expect(JSON.stringify(body)).not.toContain("re_secret_1234");

    const saved = JSON.parse(
      upsert.bind.mock.calls[0][1],
    ) as NotificationEmailConfig;
    expect(saved.resend.apiKeyEncrypted).toMatch(/^v1:/);
    expect(saved.resend.apiKeyEncrypted).not.toContain("re_secret_1234");
    await expect(
      decryptNotificationSecret(env, saved.resend.apiKeyEncrypted),
    ).resolves.toBe("re_secret_1234");
  });

  it("keeps an existing API key when the update omits a new key", async () => {
    const select = statement({
      first: row({
        resend: {
          apiKeyEncrypted: "v1:existing",
          apiKeyHint: "••••old",
          configured: true,
        },
      }),
    });
    const upsert = statement();

    const response = await handleNotificationEmailConfigAdmin(
      jsonRequest({ fromName: "InsightFlare Mail" }),
      createEnv([select, upsert]),
    );

    expect(response.status).toBe(200);
    const saved = JSON.parse(
      upsert.bind.mock.calls[0][1],
    ) as NotificationEmailConfig;
    expect(saved.fromName).toBe("InsightFlare Mail");
    expect(saved.resend.apiKeyEncrypted).toBe("v1:existing");
    expect(saved.resend.configured).toBe(true);
  });

  it("clears an existing API key and rejects enabling without a key", async () => {
    const clearSelect = statement({
      first: row({
        resend: {
          apiKeyEncrypted: "v1:existing",
          apiKeyHint: "••••old",
          configured: true,
        },
      }),
    });
    const clearUpsert = statement();
    const clearResponse = await handleNotificationEmailConfigAdmin(
      jsonRequest({ clearResendApiKey: true }),
      createEnv([clearSelect, clearUpsert]),
    );
    expect(clearResponse.status).toBe(200);
    const saved = JSON.parse(
      clearUpsert.bind.mock.calls[0][1],
    ) as NotificationEmailConfig;
    expect(saved.resend.configured).toBe(false);
    expect(saved.resend.apiKeyEncrypted).toBe("");

    const rejectResponse = await handleNotificationEmailConfigAdmin(
      jsonRequest({
        enabled: true,
        provider: "resend",
        fromEmail: "noreply@example.test",
      }),
      createEnv([statement()]),
    );
    expect(rejectResponse.status).toBe(400);
  });

  it("deletes the whole notification email config", async () => {
    const deleteStmt = statement();
    const response = await handleNotificationEmailConfigAdmin(
      request({ method: "DELETE" }),
      createEnv([deleteStmt]),
    );
    const body = await jsonOf(response);

    expect(response.status).toBe(200);
    expect(deleteStmt.bind).toHaveBeenCalledWith("system:notifications:email");
    expect(body.data).toMatchObject({
      enabled: false,
      provider: "resend",
      fromName: "InsightFlare",
      fromEmail: "",
      replyTo: "",
      resend: {
        configured: false,
        apiKeyHint: "",
      },
      updatedAt: 0,
    });
  });

  it("sends a Resend test email with decrypted API key", async () => {
    const env = createEnv([]);
    const encrypted = await encryptNotificationSecret(env, "re_test_secret");
    const select = statement({
      first: row({
        fromName: "InsightFlare",
        fromEmail: "noreply@example.test",
        resend: {
          apiKeyEncrypted: encrypted,
          apiKeyHint: "••••cret",
          configured: true,
        },
      }),
    });
    const testEnv = createEnv([select]);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
      );

    const response = await handleNotificationEmailTestAdmin(
      new Request(
        "https://app.test/api/private/admin/notification-email/test",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to: "receiver@example.test" }),
        },
      ),
      testEnv,
    );
    const body = await jsonOf(response);

    expect(response.status).toBe(200);
    expect(body.data.messageId).toBe("email-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer re_test_secret",
        }),
      }),
    );
    fetchMock.mockRestore();
  });

  it("summarizes Resend errors without leaking API keys", async () => {
    const env = createEnv([]);
    const encrypted = await encryptNotificationSecret(env, "re_leaky_secret");
    const select = statement({
      first: row({
        fromEmail: "noreply@example.test",
        resend: {
          apiKeyEncrypted: encrypted,
          apiKeyHint: "••••cret",
          configured: true,
        },
      }),
    });
    const testEnv = createEnv([select]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Domain is not verified",
        }),
        { status: 400 },
      ),
    );

    const response = await handleNotificationEmailTestAdmin(
      new Request(
        "https://app.test/api/private/admin/notification-email/test",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to: "receiver@example.test" }),
        },
      ),
      testEnv,
    );
    const body = await jsonOf(response);

    expect(response.status).toBe(400);
    expect(JSON.stringify(body)).toContain("Domain is not verified");
    expect(JSON.stringify(body)).not.toContain("re_leaky_secret");
    fetchMock.mockRestore();
  });
});
