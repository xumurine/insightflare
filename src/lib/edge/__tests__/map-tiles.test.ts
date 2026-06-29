import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleMapTileRequest } from "@/lib/edge/map-tiles";

function params(z: string, x: string, y: string) {
  return { z, x, y };
}

describe("map tile route", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects invalid tile coordinates before fetching upstreams", async () => {
    const response = await handleMapTileRequest(
      new Request("https://app.test/api/map-tiles/21/0/0.png"),
      params("21", "0", "0.png"),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid tile coordinate");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects non-numeric and non-finite tile parameters", async () => {
    await expect(
      handleMapTileRequest(
        new Request("https://app.test/api/map-tiles/nope/0/0.png"),
        params("nope", "0", "0.png"),
      ),
    ).resolves.toMatchObject({ status: 400 });

    await expect(
      handleMapTileRequest(
        new Request("https://app.test/api/map-tiles/2/999/1"),
        params("2", "9".repeat(400), "1"),
      ),
    ).resolves.toMatchObject({ status: 400 });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("normalizes x, resolves dark theme fallback, and returns cached tile headers", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/webp" },
        }),
      );

    const response = await handleMapTileRequest(
      new Request("https://app.test/api/map-tiles/2/5/3.png?theme=dark"),
      params("2", "5", "3.png"),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://basemaps.cartocdn.com/dark_all/2/1/3.png",
      expect.objectContaining({
        headers: {
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://basemaps.cartocdn.com/dark_nolabels/2/1/3.png",
      expect.any(Object),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("x-map-theme")).toBe("dark");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("uses light tiles by default and falls back to image/png content type", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array([4])));

    const response = await handleMapTileRequest(
      new Request("https://app.test/api/map-tiles/1/0/0"),
      params("1", "0", "0"),
    );

    expect(fetch).toHaveBeenCalledWith(
      "https://basemaps.cartocdn.com/light_all/1/0/0.png",
      expect.any(Object),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-map-theme")).toBe("light");
  });

  it("returns the last upstream status when every tile upstream fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }))
      .mockRejectedValueOnce(new Error("network down"));

    const response = await handleMapTileRequest(
      new Request("https://app.test/api/map-tiles/1/0/0.png"),
      params("1", "0", "0.png"),
    );

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Tile upstream unavailable");
  });
});
