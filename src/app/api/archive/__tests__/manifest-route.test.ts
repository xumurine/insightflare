import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchEdgeForServer } from "@/lib/edge-proxy";

import { GET } from "../manifest/route";

vi.mock("@/lib/edge-proxy", () => ({
  fetchEdgeForServer: vi.fn(),
}));

const fetchEdgeForServerMock = vi.mocked(fetchEdgeForServer);

describe("archive manifest route", () => {
  beforeEach(() => {
    fetchEdgeForServerMock.mockReset();
  });

  it("rejects requests without a site id", async () => {
    const response = await GET(
      new Request("https://app.test/api/archive/manifest"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Missing siteId",
    });
    expect(fetchEdgeForServerMock).not.toHaveBeenCalled();
  });

  it("fetches and decorates manifest file fetch URLs", async () => {
    fetchEdgeForServerMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          files: [
            { archiveKey: "site 1/day.parquet", size: 123 },
            { archiveKey: 42, size: 456 },
          ],
        }),
      ),
    );

    const response = await GET(
      new Request(
        "https://app.test/api/archive/manifest?siteId=site-1&from=2026-01-01&to=2026-01-31",
      ),
    );

    expect(fetchEdgeForServerMock).toHaveBeenCalledWith({
      baseUrl: "https://app.test",
      pathname: "/api/private/archive/manifest",
      params: {
        siteId: "site-1",
        from: "2026-01-01",
        to: "2026-01-31",
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      files: [
        {
          archiveKey: "site 1/day.parquet",
          size: 123,
          fetchUrl: "/api/archive/file?key=site%201%2Fday.parquet",
        },
        { archiveKey: 42, size: 456, fetchUrl: undefined },
      ],
    });
  });

  it("returns upstream failures and invalid JSON payloads", async () => {
    fetchEdgeForServerMock.mockResolvedValueOnce(
      new Response("upstream down", { status: 503 }),
    );

    const failed = await GET(
      new Request("https://app.test/api/archive/manifest?siteId=site-1"),
    );

    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({
      ok: false,
      error: "Failed to fetch archive manifest",
      detail: "upstream down",
    });

    fetchEdgeForServerMock.mockResolvedValueOnce(new Response("{bad json"));
    const invalidJson = await GET(
      new Request("https://app.test/api/archive/manifest?siteId=site-1"),
    );

    expect(invalidJson.status).toBe(502);
    expect(await invalidJson.json()).toEqual({
      ok: false,
      error: "Archive manifest payload is invalid JSON",
    });
  });
});
