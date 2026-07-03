import { isHostingASN } from "asn-blocklist";
import { describe, expect, it, vi } from "vitest";

import {
  BOT_ANALYTICS_BLOBS,
  BOT_ANALYTICS_DOUBLES,
  classifyCollectBotTraffic,
  writeBotAnalyticsEvent,
} from "@/lib/edge/bot-protection";
import type { Env, TrackerClientPayload } from "@/lib/edge/types";

vi.mock("asn-blocklist", () => ({
  isHostingASN: vi.fn((asn: unknown) => Number(asn) === 13335),
}));

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function request(headers: HeadersInit, cf?: Record<string, unknown>): Request {
  const inputHeaders = new Headers(headers);
  const req = new Request("https://collector.test/collect", {
    method: "POST",
    headers: inputHeaders,
  });
  vi.spyOn(req.headers, "get").mockImplementation((name) =>
    inputHeaders.get(name),
  );
  if (cf) {
    Object.defineProperty(req, "cf", {
      value: cf,
      configurable: true,
    });
  }
  return req;
}

const payload: TrackerClientPayload = {
  siteId: "site-1",
  kind: "pageview",
  visitId: "visit-1",
  pathname: "/pricing",
  hostname: "example.com",
};

describe("bot protection", () => {
  it("keeps the Analytics Engine schema within data point limits", () => {
    expect(BOT_ANALYTICS_BLOBS).toHaveLength(20);
    expect(BOT_ANALYTICS_DOUBLES.length).toBeLessThanOrEqual(20);
  });

  it("classifies known bot user agents as high confidence bot traffic", () => {
    const result = classifyCollectBotTraffic({
      request: request({
        "user-agent": "Googlebot/2.1",
        origin: "https://example.com",
      }),
      payload,
      origin: "https://example.com",
    });

    expect(result).toMatchObject({
      isBot: true,
      confidence: "high",
    });
    expect(result.reasons).toContain("ua_isbot");
  });

  it("classifies script user agents as high confidence bot traffic", () => {
    const result = classifyCollectBotTraffic({
      request: request({
        "user-agent": "curl/8.14.1",
        origin: "https://example.com",
      }),
      payload,
      origin: "https://example.com",
    });

    expect(result).toMatchObject({
      isBot: true,
      confidence: "high",
    });
    expect(result.reasons).toContain("script_ua");
  });

  it("classifies configured hosting ASNs as medium confidence bot traffic", () => {
    const result = classifyCollectBotTraffic({
      request: request(
        {
          "user-agent": CHROME_UA,
          origin: "https://example.com",
        },
        {
          asn: 13335,
          asOrganization: "Cloudflare Inc.",
        },
      ),
      payload,
      origin: "https://example.com",
    });

    expect(result).toMatchObject({
      isBot: true,
      confidence: "medium",
    });
    expect(result.reasons).toContain("hosting_asn");
    expect(vi.mocked(isHostingASN)).toHaveBeenCalledWith(13335);
  });

  it("does not classify AS organization names without a blocked ASN", () => {
    vi.mocked(isHostingASN).mockReturnValueOnce(false);
    const result = classifyCollectBotTraffic({
      request: request(
        {
          "user-agent": CHROME_UA,
          origin: "https://example.com",
          "sec-fetch-site": "cross-site",
        },
        {
          asn: 64512,
          asOrganization: "Amazon Data Services Singapore",
        },
      ),
      payload,
      origin: "https://example.com",
    });

    expect(result).toEqual({
      isBot: false,
      confidence: "low",
      reasons: [],
    });
  });

  it("keeps normal browser requests on the main lane", () => {
    const result = classifyCollectBotTraffic({
      request: request({
        "user-agent": CHROME_UA,
        origin: "https://example.com",
        "sec-fetch-site": "cross-site",
      }),
      payload,
      origin: "https://example.com",
    });

    expect(result).toEqual({
      isBot: false,
      confidence: "low",
      reasons: [],
    });
  });

  it("writes rich bot analytics points with site index and metadata", () => {
    const writeDataPoint = vi.fn();
    const env = {
      BOT_ANALYTICS: { writeDataPoint },
    } as unknown as Env;

    writeBotAnalyticsEvent(env, {
      request: request(
        {
          "user-agent": "curl/8.14.1",
          "cf-connecting-ip": "203.0.113.10",
          "cf-ray": "ray-1",
          origin: "https://example.com",
        },
        {
          asn: 137409,
          asOrganization: "GSL Networks Pty LTD - Tokyo",
          country: "JP",
          region: "Tokyo",
          city: "Tokyo",
          continent: "AS",
          colo: "NRT",
          latitude: "35.6895",
          longitude: "139.69171",
        },
      ),
      payload,
      siteId: "site-1",
      origin: "https://example.com",
      traceId: "trace-1",
      receivedAt: 1_800_000_000_000,
      classification: {
        isBot: true,
        confidence: "high",
        reasons: ["script_ua"],
      },
    });

    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const point = writeDataPoint.mock.calls[0]?.[0];
    expect(point).toMatchObject({
      indexes: ["site-1"],
      doubles: [
        1_800_000_000_000,
        137409,
        35.6895,
        139.69171,
        0,
        "curl/8.14.1".length,
      ],
    });
    expect(point?.blobs).toEqual(
      expect.arrayContaining([
        "site-1",
        "pageview",
        "high",
        "script_ua",
        "203.0.113.10",
        "curl/8.14.1",
        "JP",
        "ray-1",
        "trace-1",
      ]),
    );
  });
});
