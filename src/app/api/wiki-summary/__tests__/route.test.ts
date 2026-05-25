import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../route";

describe("wiki summary route", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects invalid or missing wikidata ids", async () => {
    const response = await GET(
      new Request("https://app.test/api/wiki-summary?wikidataId=bad"),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(await response.json()).toEqual({
      ok: false,
      error: "Invalid or missing wikidataId",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 404 when Wikidata does not contain the requested entity", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ entities: {} })),
    );

    const response = await GET(
      new Request("https://app.test/api/wiki-summary?wikidataId=q42"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Wikidata entity not found",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("resolves Wikidata labels, Wikipedia summary, and Chinese URL variants", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            entities: {
              Q42: {
                id: "Q42",
                labels: {
                  zh: { value: "Douglas Adams zh" },
                  en: { value: "Douglas Adams" },
                },
                descriptions: {
                  zh: { value: "Writer zh" },
                  en: { value: "English writer" },
                },
                sitelinks: {
                  zhwiki: {
                    title: "Douglas Adams",
                    url: "https://zh.wikipedia.org/wiki/Douglas_Adams",
                  },
                },
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            title: "Douglas Adams",
            description: "Author summary",
            extract: "Summary extract",
            extract_html: "<p>Summary extract</p>",
            thumbnail: {
              source: "https://upload.example.test/thumb.jpg",
            },
            content_urls: {
              desktop: {
                page: "https://zh.wikipedia.org/wiki/Douglas_Adams",
              },
            },
          }),
        ),
      );

    const response = await GET(
      new Request(
        "https://app.test/api/wiki-summary?wikidataId=q42&lang=zh-TW",
      ),
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        href: expect.stringContaining("ids=Q42"),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: "application/json",
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://zh.wikipedia.org/api/rest_v1/page/summary/Douglas%20Adams",
      expect.objectContaining({
        headers: expect.objectContaining({
          "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
        }),
      }),
    );
    expect(await response.json()).toEqual({
      ok: true,
      wikidataId: "Q42",
      requestedLanguage: "zh",
      resolvedLanguage: "zh",
      fallback: false,
      wikidata: {
        id: "Q42",
        label: "Douglas Adams zh",
        description: "Writer zh",
      },
      wikipedia: {
        language: "zh",
        title: "Douglas Adams",
        description: "Author summary",
        extract: "Summary extract",
        extractHtml: "<p>Summary extract</p>",
        thumbnailUrl: "https://upload.example.test/thumb.jpg",
        pageUrl: "https://zh.wikipedia.org/wiki/Douglas_Adams?variant=zh-tw",
      },
    });
  });

  it("falls back to Wikidata-only payloads when Wikipedia has no page", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            entities: {
              Q7: {
                labels: {
                  en: { value: "Entity Seven" },
                },
                descriptions: {},
                sitelinks: {
                  enwiki: {
                    title: "Entity Seven",
                  },
                },
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));

    const response = await GET(
      new Request("https://app.test/api/wiki-summary?wikidataId=Q7"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      wikidataId: "Q7",
      requestedLanguage: "en",
      resolvedLanguage: "en",
      wikidata: {
        id: "Q7",
        label: "Entity Seven",
        description: null,
      },
      wikipedia: {
        language: "en",
        title: "Entity Seven",
        description: null,
        extract: null,
        extractHtml: null,
        thumbnailUrl: null,
        pageUrl: null,
      },
    });
  });

  it("returns 502 when upstream requests fail", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    );

    const response = await GET(
      new Request("https://app.test/api/wiki-summary?wikidataId=Q42"),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Wiki upstream unavailable",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[wiki-summary] upstream request failed",
      expect.any(Error),
    );
  });
});
