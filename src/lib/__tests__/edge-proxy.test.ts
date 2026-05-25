import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildEdgeUrl,
  buildEdgeUrlWithBase,
  fetchEdgeForServer,
  resolveEdgeBaseUrl,
} from "@/lib/edge-proxy";

vi.mock("@/lib/auth", () => ({
  getSessionToken: vi.fn().mockResolvedValue("session-token"),
}));

describe("edge proxy helpers", () => {
  beforeEach(() => {
    vi.stubEnv("INSIGHTFLARE_EDGE_URL", "");
    vi.restoreAllMocks();
  });

  it("resolves the edge base URL from env, request URL, or default fallback", () => {
    vi.stubEnv("INSIGHTFLARE_EDGE_URL", " https://edge.example.test ");
    expect(resolveEdgeBaseUrl("https://app.example.test/path")).toBe(
      "https://edge.example.test",
    );

    vi.stubEnv("INSIGHTFLARE_EDGE_URL", "");
    expect(resolveEdgeBaseUrl("https://app.example.test/path?q=1")).toBe(
      "https://app.example.test",
    );
    expect(resolveEdgeBaseUrl("not a url")).toBe("http://127.0.0.1:8787");
  });

  it("builds edge URLs with base, path, and query params", () => {
    expect(
      buildEdgeUrlWithBase("https://edge.example.test/base", "/api/test", {
        q: "hello world",
      }),
    ).toBe("https://edge.example.test/api/test?q=hello+world");

    vi.stubEnv("INSIGHTFLARE_EDGE_URL", "https://edge.example.test");
    expect(buildEdgeUrl("/api/test", { siteId: "site-1" })).toBe(
      "https://edge.example.test/api/test?siteId=site-1",
    );
  });

  it("forwards server requests with session authorization and JSON body handling", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await fetchEdgeForServer({
      baseUrl: "https://edge.example.test",
      pathname: "/api/write",
      method: "PATCH",
      params: { siteId: "site-1" },
      headers: {
        "x-custom": "yes",
        "x-empty": "",
      },
      body: { enabled: true },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;

    expect(url).toBe("https://edge.example.test/api/write?siteId=site-1");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ enabled: true }));
    expect(init.cache).toBe("no-store");
    expect(headers.get("authorization")).toBe("Bearer session-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-custom")).toBe("yes");
    expect(headers.has("x-empty")).toBe(false);
  });

  it("does not attach a body or JSON content type for GET requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchEdgeForServer({
      baseUrl: "https://edge.example.test",
      pathname: "/api/read",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(headers.get("content-type")).toBeNull();
  });
});
