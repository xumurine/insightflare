import { describe, expect, it } from "vitest";

import { normalizeIngestRecord } from "@/lib/edge/ingest-record-normalize";
import type { StoredOpenVisit } from "@/lib/edge/ingest-types";
import type {
  IngestEnvelopePayload,
  TrackerClientPayload,
} from "@/lib/edge/types";
import { deriveEuVisitorId } from "@/lib/edge/utils";

const receivedAt = 1_700_000_000_000;

function makeEnvelope(
  client: Record<string, unknown>,
  request?: Partial<IngestEnvelopePayload["request"]>,
): IngestEnvelopePayload {
  return {
    trace: {
      id: "trace-1",
      source: "test",
      acceptedAt: receivedAt,
    },
    request: {
      method: "POST",
      url: "https://collector.example/ingest",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "cf-connection-ip": "203.0.113.10",
      },
      cf: {
        country: "US",
        region: "California",
        regionCode: "CA",
        city: "San Francisco",
        continent: "NA",
        latitude: "bad",
        longitude: Number.POSITIVE_INFINITY,
        postalCode: "94105",
        metroCode: "807",
        timezone: "America/Los_Angeles",
        asOrganization: "Example ISP",
      },
      body: "",
      receivedAt,
      ...request,
    },
    client: {
      siteId: "site-1",
      timestamp: receivedAt - 1_000,
      startedAt: receivedAt - 2_000,
      ...client,
    } as TrackerClientPayload,
  };
}

function makeVisit(overrides: Partial<StoredOpenVisit> = {}): StoredOpenVisit {
  return {
    siteId: "site-1",
    visitId: "visit-1",
    visitorId: "visitor-from-visit",
    sessionId: "session-from-visit",
    startedAt: receivedAt - 5_000,
    lastActivityAt: receivedAt - 100,
    pathname: "/from-visit",
    queryString: "utm_source=visit",
    hashFragment: "#visit",
    hostname: "example.com",
    title: "Visit title",
    referrerUrl: "https://ref.example/start",
    referrerHost: "ref.example",
    utmSource: "visit",
    utmMedium: "",
    utmCampaign: "",
    utmTerm: "",
    utmContent: "",
    isEU: false,
    country: "US",
    region: "CA",
    regionCode: "CA",
    city: "San Francisco",
    continent: "NA",
    latitude: 37.7,
    longitude: -122.4,
    postalCode: "94105",
    metroCode: "807",
    timezone: "America/Los_Angeles",
    asOrganization: "Example ISP",
    uaRaw: "UA",
    browser: "Chrome",
    browserVersion: "120",
    os: "Windows",
    osVersion: "11",
    deviceType: "desktop",
    screenWidth: 1440,
    screenHeight: 900,
    language: "en-US",
    userId: "visit-user",
    userName: "Visit User",
    ...overrides,
  };
}

function makeContext(
  options: {
    visit?: StoredOpenVisit | null;
    inserted?: boolean;
  } = {},
) {
  const buffered: unknown[] = [];
  let alarmCount = 0;

  return {
    context: {
      env: { DAILY_SALT_SECRET: "test-secret" },
      getVisitContext: async () => options.visit ?? null,
      insertBufferedCustomEvent: (record: never) => {
        buffered.push(record);
        return options.inserted ?? true;
      },
      ensureAlarm: async () => {
        alarmCount += 1;
      },
    },
    buffered,
    get alarmCount() {
      return alarmCount;
    },
  };
}

describe("normalizeIngestRecord rejection reasons", () => {
  it("rejects records missing required site, visit, hostname, user, or event fields", async () => {
    const { context } = makeContext();

    await expect(
      normalizeIngestRecord(
        makeEnvelope({ siteId: "", kind: "pageview" }),
        context,
      ),
    ).resolves.toMatchObject({ record: null, reason: "missing_site_id" });
    await expect(
      normalizeIngestRecord(
        makeEnvelope({ kind: "pageview", visitId: "" }),
        context,
      ),
    ).resolves.toMatchObject({ record: null, reason: "missing_visit_id" });
    await expect(
      normalizeIngestRecord(
        makeEnvelope({ kind: "pageview", visitId: "visit-1", hostname: "" }),
        context,
      ),
    ).resolves.toMatchObject({ record: null, reason: "missing_hostname" });
    await expect(
      normalizeIngestRecord(
        makeEnvelope({ kind: "identify", visitId: "visit-1" }),
        context,
      ),
    ).resolves.toMatchObject({ record: null, reason: "missing_user_id" });
    await expect(
      normalizeIngestRecord(
        makeEnvelope({
          kind: "custom_event",
          visitId: "visit-1",
          eventName: "",
        }),
        context,
      ),
    ).resolves.toMatchObject({ record: null, reason: "missing_event_name" });
    await expect(
      normalizeIngestRecord(makeEnvelope({ kind: "not_real" }), context),
    ).resolves.toMatchObject({
      record: null,
      reason: "unsupported_kind",
      detail: { kind: "not_real" },
    });
  });
});

describe("normalizeIngestRecord pageview records", () => {
  it("normalizes pageview URL, user, geo, viewport, and EU visitor fields", async () => {
    const { context } = makeContext();
    const envelope = makeEnvelope(
      {
        kind: "pageview",
        visitId: "visit-1",
        sessionId: "",
        visitorId: "client-visitor",
        hostname: "EXAMPLE.COM",
        pathname: "",
        query:
          "utm_source=newsletter&utm_medium=email&utm_campaign=launch&utm_term=term&utm_content=hero",
        hash: "#section",
        title: "Hello",
        referrerUrl: "https://example.com/previous",
        userId: "user-1",
        userName: "Ada",
        screenWidth: "wide",
        screenHeight: Number.NaN,
        language: "en-US",
      },
      {
        cf: {
          isEUCountry: true,
          country: "DE",
          latitude: "bad",
          longitude: "also-bad",
        },
      },
    );
    const expectedVisitorId = await deriveEuVisitorId({
      ip: "203.0.113.10",
      ua: envelope.request.headers["user-agent"]!,
      eventAtMs: receivedAt - 1_000,
      secret: "test-secret",
    });

    const result = await normalizeIngestRecord(envelope, context);

    expect(result.record).toMatchObject({
      kind: "pageview",
      traceId: "trace-1",
      siteId: "site-1",
      visitId: "visit-1",
      visitorId: expectedVisitorId,
      startedAt: receivedAt - 2_000,
      pathname: "/",
      hostname: "example.com",
      queryString:
        "utm_source=newsletter&utm_medium=email&utm_campaign=launch&utm_term=term&utm_content=hero",
      hashFragment: "#section",
      title: "Hello",
      referrerUrl: "",
      referrerHost: "",
      utmSource: "newsletter",
      utmMedium: "email",
      utmCampaign: "launch",
      utmTerm: "term",
      utmContent: "hero",
      userId: "user-1",
      userName: "Ada",
      screenWidth: null,
      screenHeight: null,
      language: "en-US",
      isEU: true,
      country: "DE",
      latitude: null,
      longitude: null,
    });
    expect(result.record).toHaveProperty("sessionId");
    expect(result.record?.sessionId).not.toBe("");
  });
});

describe("normalizeIngestRecord leave and identify records", () => {
  it("normalizes leave duration, performance visit lookup, and sparse performance data", async () => {
    const { context } = makeContext();

    const result = await normalizeIngestRecord(
      makeEnvelope({
        kind: "leave",
        visitId: "visit-1",
        sessionId: "session-1",
        durationMs: "bad",
        performance: {
          ttfb: 10.1234,
          fcp: -1,
          cls: "bad",
        },
      }),
      context,
    );

    expect(result.record).toEqual({
      kind: "leave",
      traceId: "trace-1",
      siteId: "site-1",
      visitId: "visit-1",
      sessionId: "session-1",
      performanceVisitId: "visit-1",
      receivedAt,
      leaveAt: receivedAt - 1_000,
      durationMs: null,
      performance: {
        ttfb: 10.123,
      },
    });
  });

  it("normalizes identify user and session fields", async () => {
    const { context } = makeContext();

    await expect(
      normalizeIngestRecord(
        makeEnvelope({
          kind: "identify",
          visitId: "visit-1",
          sessionId: "session-1",
          userId: "user-1",
          userName: "Ada",
        }),
        context,
      ),
    ).resolves.toMatchObject({
      record: {
        kind: "identify",
        siteId: "site-1",
        visitId: "visit-1",
        sessionId: "session-1",
        userId: "user-1",
        userName: "Ada",
        receivedAt,
      },
    });
  });
});

describe("normalizeIngestRecord custom event records", () => {
  it("rejects invalid eventData before visit lookup", async () => {
    const { context } = makeContext({ visit: makeVisit() });

    await expect(
      normalizeIngestRecord(
        makeEnvelope({
          kind: "custom_event",
          visitId: "visit-1",
          eventName: "signup",
        }),
        context,
      ),
    ).resolves.toMatchObject({
      record: null,
      reason: "invalid_custom_event_data",
      detail: { error: "eventData is required" },
    });
  });

  it("buffers valid custom events until the visit is available", async () => {
    const state = makeContext({ inserted: true });

    const result = await normalizeIngestRecord(
      makeEnvelope({
        kind: "custom_event",
        visitId: "visit-1",
        eventId: "event-1",
        sequence: -5,
        eventName: "signup",
        eventData: { plan: "pro", nested: { ok: true } },
        userId: "user-1",
      }),
      state.context,
    );

    expect(result).toMatchObject({
      record: null,
      reason: "waiting_for_visit",
      detail: {
        eventId: "event-1",
        eventName: "signup",
        buffered: true,
      },
    });
    expect(state.alarmCount).toBe(1);
    expect(state.buffered).toEqual([
      {
        eventId: "event-1",
        siteId: "site-1",
        visitId: "visit-1",
        occurredAt: receivedAt - 1_000,
        receivedAt,
        sequence: 0,
        eventName: "signup",
        eventDataJson: '{"plan":"pro","nested":{"ok":true}}',
        userId: "user-1",
      },
    ]);
  });

  it("maps custom events from stored visit context and overrides user fields", async () => {
    const { context } = makeContext({ visit: makeVisit() });

    const result = await normalizeIngestRecord(
      makeEnvelope({
        kind: "custom_event",
        visitId: "visit-1",
        eventId: "event-1",
        sequence: 2.9,
        eventName: "signup",
        eventData: { amount: 12, tags: ["new"] },
        userId: "client-user",
        userName: "Client User",
      }),
      context,
    );

    expect(result.record).toMatchObject({
      kind: "custom_event",
      eventId: "event-1",
      sequence: 2,
      eventAt: receivedAt - 1_000,
      eventName: "signup",
      eventDataJson: '{"amount":12,"tags":["new"]}',
      siteId: "site-1",
      visitId: "visit-1",
      visitorId: "visitor-from-visit",
      sessionId: "session-from-visit",
      pathname: "/from-visit",
      hostname: "example.com",
      userId: "client-user",
      userName: "Client User",
    });
  });
});
