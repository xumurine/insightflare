import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET, PATCH, POST } from "@/app/api/v1/[[...path]]/route";
import { handleApiV1 } from "@/lib/edge/api-v1";
import { resolveEdgeRuntime } from "@/lib/edge/runtime";

vi.mock("@/lib/edge/runtime", () => ({
  resolveEdgeRuntime: vi.fn(),
}));

vi.mock("@/lib/edge/api-v1", () => ({
  handleApiV1: vi.fn(),
}));

const resolveEdgeRuntimeMock = vi.mocked(resolveEdgeRuntime);
const handleApiV1Mock = vi.mocked(handleApiV1);

function makeRequest(method: string, path: string): Request {
  return new Request(`https://app.test/api/v1${path}`, { method });
}

describe("api/v1/[...path] route", () => {
  beforeEach(() => {
    resolveEdgeRuntimeMock.mockReset();
    handleApiV1Mock.mockReset();
  });

  it("delegates GET requests to handleApiV1", async () => {
    const requestWithCf = makeRequest("GET", "/sites");
    const env = { DB: {} };
    const ctx = { waitUntil: vi.fn() };
    const url = new URL("https://app.test/api/v1/sites");

    resolveEdgeRuntimeMock.mockResolvedValue({
      request: requestWithCf,
      env,
      ctx,
      url,
    } as any);
    handleApiV1Mock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await GET(makeRequest("GET", "/sites"));

    expect(resolveEdgeRuntimeMock).toHaveBeenCalledWith(expect.any(Request));
    expect(handleApiV1Mock).toHaveBeenCalledWith(requestWithCf, env, url, ctx);
    expect(response.status).toBe(200);
  });

  it("delegates POST requests to handleApiV1", async () => {
    const requestWithCf = makeRequest("POST", "/sites");
    const env = { DB: {} };
    const ctx = { waitUntil: vi.fn() };
    const url = new URL("https://app.test/api/v1/sites");

    resolveEdgeRuntimeMock.mockResolvedValue({
      request: requestWithCf,
      env,
      ctx,
      url,
    } as any);
    handleApiV1Mock.mockResolvedValue(new Response(null, { status: 201 }));

    const response = await POST(makeRequest("POST", "/sites"));

    expect(handleApiV1Mock).toHaveBeenCalledWith(requestWithCf, env, url, ctx);
    expect(response.status).toBe(201);
  });

  it("delegates PATCH requests to handleApiV1", async () => {
    const requestWithCf = makeRequest("PATCH", "/sites/s1");
    const env = { DB: {} };
    const ctx = { waitUntil: vi.fn() };
    const url = new URL("https://app.test/api/v1/sites/s1");

    resolveEdgeRuntimeMock.mockResolvedValue({
      request: requestWithCf,
      env,
      ctx,
      url,
    } as any);
    handleApiV1Mock.mockResolvedValue(new Response(null, { status: 200 }));

    const response = await PATCH(makeRequest("PATCH", "/sites/s1"));

    expect(handleApiV1Mock).toHaveBeenCalledWith(requestWithCf, env, url, ctx);
    expect(response.status).toBe(200);
  });

  it("delegates DELETE requests to handleApiV1", async () => {
    const requestWithCf = makeRequest("DELETE", "/sites/s1");
    const env = { DB: {} };
    const ctx = { waitUntil: vi.fn() };
    const url = new URL("https://app.test/api/v1/sites/s1");

    resolveEdgeRuntimeMock.mockResolvedValue({
      request: requestWithCf,
      env,
      ctx,
      url,
    } as any);
    handleApiV1Mock.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await DELETE(makeRequest("DELETE", "/sites/s1"));

    expect(handleApiV1Mock).toHaveBeenCalledWith(requestWithCf, env, url, ctx);
    expect(response.status).toBe(204);
  });

  it("propagates errors from handleApiV1", async () => {
    resolveEdgeRuntimeMock.mockResolvedValue({
      request: makeRequest("GET", "/bad"),
      env: {},
      ctx: {},
      url: new URL("https://app.test/api/v1/bad"),
    } as any);
    handleApiV1Mock.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: { code: "not_found" } }),
        { status: 404 },
      ),
    );

    const response = await GET(makeRequest("GET", "/bad"));

    expect(response.status).toBe(404);
  });

  it("propagates runtime resolution errors", async () => {
    resolveEdgeRuntimeMock.mockRejectedValue(new Error("no cloudflare ctx"));

    await expect(GET(makeRequest("GET", "/sites"))).rejects.toThrow(
      "no cloudflare ctx",
    );
  });
});
