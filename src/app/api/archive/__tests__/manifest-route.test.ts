import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/archive/manifest/route";
import { fetchEdgeForServer } from "@/lib/edge-proxy";

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
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "missing_site_id", message: "Missing siteId" },
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
    const body = (await response.json()) as Record<string, unknown>;
    const files = body.files as Array<Record<string, unknown>>;
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      archiveKey: "site 1/day.parquet",
      size: 123,
      fetchUrl: "/api/archive/file?key=site%201%2Fday.parquet",
    });
    expect(files[1]).toMatchObject({
      archiveKey: 42,
      size: 456,
    });
    expect(files[1]).not.toHaveProperty("fetchUrl");
  });

  it("returns upstream failures and invalid JSON payloads", async () => {
    fetchEdgeForServerMock.mockResolvedValueOnce(
      new Response("upstream down", { status: 503 }),
    );

    const failed = await GET(
      new Request("https://app.test/api/archive/manifest?siteId=site-1"),
    );

    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({
      ok: false,
      error: {
        code: "fetch_archive_manifest_failed",
        message: "upstream down",
      },
    });

    fetchEdgeForServerMock.mockResolvedValueOnce(new Response("{bad json"));
    const invalidJson = await GET(
      new Request("https://app.test/api/archive/manifest?siteId=site-1"),
    );

    expect(invalidJson.status).toBe(502);
    expect(await invalidJson.json()).toMatchObject({
      ok: false,
      error: {
        code: "invalid_manifest_json",
        message: "Archive manifest payload is invalid JSON",
      },
    });
  });
});
