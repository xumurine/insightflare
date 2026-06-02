import { afterEach, describe, expect, it, vi } from "vitest";

import {
  handleFunnelAnalysis,
  handleFunnelCreate,
  handleFunnelDelete,
  handleFunnelList,
} from "@/lib/edge/query/funnels";
import type { Env } from "@/lib/edge/types";

interface PreparedCall {
  bindings: unknown[];
  method: "all" | "run";
  sql: string;
}

function createEnv(
  selectResults: (
    sql: string,
    bindings: unknown[],
  ) => Record<string, unknown>[] = () => [],
) {
  const calls: PreparedCall[] = [];
  const env = {
    DB: {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bindings: unknown[]) => ({
          all: vi.fn(async () => {
            calls.push({ sql, bindings, method: "all" });
            return { results: selectResults(sql, bindings) };
          }),
          run: vi.fn(async () => {
            calls.push({ sql, bindings, method: "run" });
            return { success: true };
          }),
        })),
      })),
    },
  } as unknown as Env;

  return { calls, env };
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("funnel query handlers", () => {
  it("lists funnel definitions from analysis_definitions", async () => {
    const steps = [
      { type: "pageview", value: "/pricing" },
      { type: "event", value: "signup_started" },
    ];
    const legacySteps = [
      { type: "pageview", value: "/docs" },
      { type: "pageview", value: "/docs/install" },
    ];
    const { calls, env } = createEnv((sql) =>
      sql.includes("analysis_definitions")
        ? [
            {
              id: "funnel-1",
              site_id: "site-1",
              kind: "funnel",
              name: "Signup",
              config_json: JSON.stringify({ steps }),
              created_at: 10,
              updated_at: 20,
            },
            {
              id: "funnel-legacy",
              site_id: "site-1",
              kind: "funnel",
              name: "Docs",
              config_json: JSON.stringify(legacySteps),
              created_at: 30,
              updated_at: 40,
            },
          ]
        : [],
    );

    const response = await handleFunnelList(
      env,
      "site-1",
      new URL("https://edge.test/api/private/funnels"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      funnels: [
        {
          id: "funnel-1",
          siteId: "site-1",
          name: "Signup",
          steps,
          createdAt: 10,
          updatedAt: 20,
        },
        {
          id: "funnel-legacy",
          siteId: "site-1",
          name: "Docs",
          steps: legacySteps,
          createdAt: 30,
          updatedAt: 40,
        },
      ],
    });
    expect(calls[0]?.sql).toContain("FROM analysis_definitions");
    expect(calls[0]?.sql).not.toContain("widgets");
    expect(calls[0]?.bindings).toEqual(["site-1", "funnel"]);
  });

  it("creates funnel definitions in analysis_definitions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    const steps = [
      { type: "pageview", value: "/pricing" },
      { type: "event", value: "signup_started" },
    ];
    const { calls, env } = createEnv();

    const response = await handleFunnelCreate(
      env,
      "site-1",
      new Request("https://edge.test/api/private/funnel-create", {
        body: JSON.stringify({ name: "Signup", steps }),
        method: "POST",
      }),
    );

    const now = nowSeconds();
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      funnel: {
        id: "00000000-0000-4000-8000-000000000001",
        siteId: "site-1",
        name: "Signup",
        steps,
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(calls[0]?.sql).toContain("INSERT INTO analysis_definitions");
    expect(calls[0]?.sql).not.toContain("widgets");
    expect(calls[0]?.bindings).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "site-1",
      "funnel",
      "Signup",
      JSON.stringify({ steps }),
      now,
      now,
    ]);
  });

  it("archives funnel definitions instead of using widgets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    const { calls, env } = createEnv();

    const response = await handleFunnelDelete(
      env,
      "site-1",
      new URL("https://edge.test/api/private/funnel-delete?id=funnel-1"),
    );

    const now = nowSeconds();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(calls[0]?.sql).toContain("UPDATE analysis_definitions");
    expect(calls[0]?.sql).not.toContain("widgets");
    expect(calls[0]?.bindings).toEqual([
      now,
      now,
      "funnel-1",
      "site-1",
      "funnel",
    ]);
  });

  it("loads funnel analysis definitions from analysis_definitions", async () => {
    const steps = [
      { type: "pageview", value: "/pricing" },
      { type: "event", value: "signup_started" },
    ];
    const { calls, env } = createEnv((sql) =>
      sql.includes("analysis_definitions")
        ? [{ config_json: JSON.stringify({ steps }) }]
        : [],
    );

    const response = await handleFunnelAnalysis(
      env,
      "site-1",
      new URL(
        "https://edge.test/api/private/funnel-analysis?funnelId=funnel-1&from=1&to=1000",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      steps: [
        {
          index: 0,
          label: "/pricing",
          type: "pageview",
          sessions: 0,
          dropOffRate: 0,
          conversionRate: 0,
        },
        {
          index: 1,
          label: "signup_started",
          type: "event",
          sessions: 0,
          dropOffRate: 1,
          conversionRate: 0,
        },
      ],
      overallConversionRate: 0,
    });

    expect(calls[0]?.sql).toContain("FROM analysis_definitions");
    expect(calls[0]?.sql).not.toContain("widgets");
    expect(calls[0]?.bindings).toEqual(["funnel-1", "site-1", "funnel"]);
  });
});
