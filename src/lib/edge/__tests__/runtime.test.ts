import { getCloudflareContext } from "@opennextjs/cloudflare";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveEdgeRuntime } from "@/lib/edge/runtime";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

const getCloudflareContextMock = vi.mocked(getCloudflareContext);

describe("edge runtime resolver", () => {
  beforeEach(() => {
    getCloudflareContextMock.mockReset();
  });

  it("returns Cloudflare env, ctx, URL, and a cloned request with cf metadata", async () => {
    const env = { DB: {} };
    const ctx = { waitUntil: vi.fn() };
    const cf = { country: "US", isEUCountry: false };
    getCloudflareContextMock.mockResolvedValue({ env, ctx, cf });

    const request = new Request("https://edge.test/api/private?siteId=site-1", {
      method: "POST",
      headers: { "x-test": "yes" },
      body: "payload",
    });

    const runtime = await resolveEdgeRuntime(request);

    expect(getCloudflareContextMock).toHaveBeenCalledWith({ async: true });
    expect(runtime.env).toBe(env);
    expect(runtime.ctx).toBe(ctx);
    expect(runtime.url.toString()).toBe(
      "https://edge.test/api/private?siteId=site-1",
    );
    expect(runtime.request).not.toBe(request);
    expect(runtime.request.method).toBe("POST");
    expect(runtime.request.headers.get("x-test")).toBe("yes");
    expect((runtime.request as Request & { cf?: unknown }).cf).toBe(cf);
  });

  it("sets cf metadata to null when the Cloudflare context omits it", async () => {
    getCloudflareContextMock.mockResolvedValue({
      env: {},
      ctx: {},
      cf: undefined,
    });

    const runtime = await resolveEdgeRuntime(new Request("https://edge.test/"));

    expect((runtime.request as Request & { cf?: unknown }).cf).toBeNull();
    expect(runtime.url.pathname).toBe("/");
  });
});
