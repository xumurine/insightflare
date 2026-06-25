import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, HEAD } from "@/app/api/archive/file/route";
import { fetchEdgeForServer } from "@/lib/edge-proxy";

vi.mock("@/lib/edge-proxy", () => ({
  fetchEdgeForServer: vi.fn(),
}));

const fetchEdgeForServerMock = vi.mocked(fetchEdgeForServer);

describe("archive file route", () => {
  beforeEach(() => {
    fetchEdgeForServerMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects requests without an archive key", async () => {
    const response = await GET(
      new Request("https://app.test/api/archive/file"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "missing_key", message: "Missing key" },
    });
    expect(fetchEdgeForServerMock).not.toHaveBeenCalled();
  });

  it("proxies GET requests with range headers and passthrough metadata", async () => {
    fetchEdgeForServerMock.mockResolvedValue(
      new Response(new TextEncoder().encode("parquet-bytes"), {
        status: 206,
        headers: {
          "content-range": "bytes 0-12/100",
          etag: "archive-etag",
        },
      }),
    );

    const response = await GET(
      new Request("https://app.test/api/archive/file?key=site/day.parquet", {
        headers: { range: "bytes=0-12" },
      }),
    );

    expect(fetchEdgeForServerMock).toHaveBeenCalledWith({
      baseUrl: "https://app.test",
      pathname: "/api/private/archive/file",
      method: "GET",
      params: { key: "site/day.parquet" },
      headers: { range: "bytes=0-12" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-12/100");
    expect(response.headers.get("etag")).toBe("archive-etag");
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.apache.parquet",
    );
    expect(await response.text()).toBe("parquet-bytes");
  });

  it("proxies HEAD requests without a response body", async () => {
    fetchEdgeForServerMock.mockResolvedValue(
      new Response("ignored", {
        headers: { "content-type": "application/octet-stream" },
      }),
    );

    const response = await HEAD(
      new Request("https://app.test/api/archive/file?key=archive.parquet", {
        method: "HEAD",
      }),
    );

    expect(fetchEdgeForServerMock).toHaveBeenCalledWith({
      baseUrl: "https://app.test",
      pathname: "/api/private/archive/file",
      method: "HEAD",
      params: { key: "archive.parquet" },
      headers: { range: undefined },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(await response.text()).toBe("");
  });

  it("returns upstream failures as JSON", async () => {
    fetchEdgeForServerMock.mockResolvedValue(
      new Response("not found", { status: 404 }),
    );

    const response = await GET(
      new Request("https://app.test/api/archive/file?key=missing.parquet"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "fetch_archive_file_failed", message: "not found" },
    });
  });
});
