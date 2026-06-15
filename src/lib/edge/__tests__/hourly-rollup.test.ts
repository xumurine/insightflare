import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  queryOverviewForSitesFromHourlyRollups,
  queryTrendForSitesFromHourlyRollups,
  runHourlyAggregation,
} from "@/lib/edge/hourly-rollup";
import type { Env } from "@/lib/edge/types";

type Binding = string | number | null;
type Row = Record<string, unknown>;

class BoundStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly bindings: Binding[],
  ) {}

  async all<T extends Row>(): Promise<{ results: T[] }> {
    return {
      results: this.db
        .prepare(this.sql)
        .all(...this.bindings)
        .map((row) => ({ ...row }) as T),
    };
  }

  async first<T extends Row>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.bindings);
    return row ? ({ ...row } as T) : null;
  }

  async run(): Promise<void> {
    this.db.prepare(this.sql).run(...this.bindings);
  }
}

class FakeD1Database {
  readonly db = new DatabaseSync(":memory:");

  prepare(sql: string) {
    return {
      bind: (...bindings: Binding[]) =>
        new BoundStatement(this.db, sql, bindings),
    };
  }

  async batch(statements: BoundStatement[]): Promise<void> {
    for (const statement of statements) {
      await statement.run();
    }
  }

  close(): void {
    this.db.close();
  }
}

function createEnv() {
  const d1 = new FakeD1Database();
  d1.db.exec(`
    CREATE TABLE sites (
      id TEXT PRIMARY KEY
    );

    CREATE TABLE visits (
      visit_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      duration_ms INTEGER,
      perf_ttfb_ms REAL,
      perf_fcp_ms REAL,
      perf_lcp_ms REAL,
      perf_cls REAL,
      perf_inp_ms REAL
    );

    CREATE TABLE visit_hourly_rollups (
      site_id TEXT NOT NULL,
      hour_bucket INTEGER NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      sessions INTEGER NOT NULL DEFAULT 0,
      visitors INTEGER NOT NULL DEFAULT 0,
      bounces INTEGER NOT NULL DEFAULT 0,
      duration_ms_sum INTEGER NOT NULL DEFAULT 0,
      duration_ms_count INTEGER NOT NULL DEFAULT 0,
      visitor_set_json TEXT NOT NULL DEFAULT '[]',
      session_counts_json TEXT NOT NULL DEFAULT '[]',
      perf_ttfb_sum REAL NOT NULL DEFAULT 0,
      perf_ttfb_count INTEGER NOT NULL DEFAULT 0,
      perf_fcp_sum REAL NOT NULL DEFAULT 0,
      perf_fcp_count INTEGER NOT NULL DEFAULT 0,
      perf_lcp_sum REAL NOT NULL DEFAULT 0,
      perf_lcp_count INTEGER NOT NULL DEFAULT 0,
      perf_cls_sum REAL NOT NULL DEFAULT 0,
      perf_cls_count INTEGER NOT NULL DEFAULT 0,
      perf_inp_sum REAL NOT NULL DEFAULT 0,
      perf_inp_count INTEGER NOT NULL DEFAULT 0,
      input_cutoff_ms INTEGER NOT NULL,
      aggregated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      schema_version INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (site_id, hour_bucket)
    );

    CREATE TABLE visit_hourly_aggregation_state (
      site_id TEXT PRIMARY KEY,
      aggregated_until_hour INTEGER NOT NULL DEFAULT 0,
      lag_hours INTEGER NOT NULL DEFAULT 12,
      last_run_at INTEGER,
      last_success_at INTEGER,
      last_error TEXT
    );

    CREATE INDEX idx_visits_site_started_at
      ON visits(site_id, started_at);
    CREATE INDEX idx_visits_open_site_started_at
      ON visits(site_id, started_at)
      WHERE status = 'open';

    INSERT INTO sites (id) VALUES ('site-1');
  `);
  return {
    d1,
    env: {
      DB: d1 as unknown as D1Database,
      INGEST_DO: {} as DurableObjectNamespace,
      DAILY_SALT_SECRET: "secret",
    } as Env,
  };
}

function insertVisit(
  d1: FakeD1Database,
  row: {
    visitId: string;
    siteId?: string;
    visitorId?: string;
    sessionId?: string;
    status?: string;
    startedAt: number;
    durationMs?: number | null;
  },
): void {
  d1.db
    .prepare(
      `
        INSERT INTO visits (
          visit_id, site_id, visitor_id, session_id, status, started_at,
          duration_ms, perf_ttfb_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      row.visitId,
      row.siteId ?? "site-1",
      row.visitorId ?? "visitor-1",
      row.sessionId ?? "session-1",
      row.status ?? "closed",
      row.startedAt,
      row.durationMs ?? null,
      100,
    );
}

describe("hourly visit rollups", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aggregates closed visits older than the lag without deleting details", async () => {
    const { env, d1 } = createEnv();
    const scheduledTime = Date.UTC(2026, 4, 25, 12);
    const oldHour = Math.floor(Date.UTC(2026, 4, 24, 20) / (60 * 60 * 1000));
    insertVisit(d1, {
      visitId: "visit-1",
      visitorId: "visitor-1",
      sessionId: "session-1",
      startedAt: oldHour * 60 * 60 * 1000 + 10_000,
      durationMs: 1000,
    });
    insertVisit(d1, {
      visitId: "visit-2",
      visitorId: "visitor-1",
      sessionId: "session-1",
      startedAt: oldHour * 60 * 60 * 1000 + 20_000,
      durationMs: 2000,
    });
    insertVisit(d1, {
      visitId: "open-visit",
      status: "open",
      startedAt: (oldHour + 1) * 60 * 60 * 1000 + 30_000,
    });
    insertVisit(d1, {
      visitId: "hot-visit",
      startedAt: Date.UTC(2026, 4, 25, 8),
    });

    await runHourlyAggregation(env, scheduledTime);
    await runHourlyAggregation(env, scheduledTime);

    const rollups = d1.db
      .prepare("SELECT * FROM visit_hourly_rollups")
      .all() as Row[];
    expect(rollups).toHaveLength(1);
    expect(rollups[0]).toMatchObject({
      site_id: "site-1",
      hour_bucket: oldHour,
      views: 2,
      sessions: 1,
      visitors: 1,
      bounces: 0,
      duration_ms_sum: 3000,
      duration_ms_count: 2,
    });
    expect(JSON.parse(String(rollups[0].session_counts_json))).toEqual([
      ["session-1", 2],
    ]);
    const visits = d1.db
      .prepare("SELECT COUNT(*) AS count FROM visits")
      .get() as { count: number };
    expect(visits.count).toBe(4);
    d1.close();
  });

  it("limits each aggregation run to seven days per site", async () => {
    const { env, d1 } = createEnv();
    const scheduledTime = Date.UTC(2026, 4, 25, 12);
    const firstHour = Math.floor(Date.UTC(2026, 4, 1, 0) / (60 * 60 * 1000));
    insertVisit(d1, {
      visitId: "first-week-visit",
      startedAt: firstHour * 60 * 60 * 1000,
      durationMs: 1000,
    });
    insertVisit(d1, {
      visitId: "later-visit",
      startedAt: (firstHour + 8 * 24) * 60 * 60 * 1000,
      durationMs: 2000,
    });

    await runHourlyAggregation(env, scheduledTime);

    const state = d1.db
      .prepare("SELECT * FROM visit_hourly_aggregation_state")
      .get() as Row;
    expect(state.aggregated_until_hour).toBe(firstHour + 7 * 24 - 1);
    const rollups = d1.db
      .prepare("SELECT hour_bucket AS hourBucket FROM visit_hourly_rollups")
      .all() as Row[];
    expect(rollups).toEqual([{ hourBucket: firstHour }]);
    d1.close();
  });

  it("does not advance past old open visits", async () => {
    const { env, d1 } = createEnv();
    const scheduledTime = Date.UTC(2026, 4, 25, 12);
    const firstHour = Math.floor(Date.UTC(2026, 4, 20, 0) / (60 * 60 * 1000));
    insertVisit(d1, {
      visitId: "closed-before-open",
      startedAt: firstHour * 60 * 60 * 1000,
      durationMs: 1000,
    });
    insertVisit(d1, {
      visitId: "blocking-open",
      status: "open",
      startedAt: (firstHour + 1) * 60 * 60 * 1000,
    });
    insertVisit(d1, {
      visitId: "closed-after-open",
      startedAt: (firstHour + 2) * 60 * 60 * 1000,
      durationMs: 2000,
    });

    await runHourlyAggregation(env, scheduledTime);

    const state = d1.db
      .prepare("SELECT * FROM visit_hourly_aggregation_state")
      .get() as Row;
    expect(state.aggregated_until_hour).toBe(firstHour);
    const rollups = d1.db
      .prepare("SELECT hour_bucket AS hourBucket FROM visit_hourly_rollups")
      .all() as Row[];
    expect(rollups).toEqual([{ hourBucket: firstHour }]);
    d1.close();
  });

  it("uses the first closed visit after an initial failure marker", async () => {
    const { env, d1 } = createEnv();
    const scheduledTime = Date.UTC(2026, 4, 25, 12);
    const firstHour = Math.floor(Date.UTC(2026, 4, 20, 0) / (60 * 60 * 1000));
    insertVisit(d1, {
      visitId: "closed-after-failure",
      startedAt: firstHour * 60 * 60 * 1000,
      durationMs: 1000,
    });
    d1.db
      .prepare(
        `
          INSERT INTO visit_hourly_aggregation_state (
            site_id, aggregated_until_hour, lag_hours, last_run_at, last_error
          ) VALUES ('site-1', 0, 12, 1, 'boom')
        `,
      )
      .run();

    await runHourlyAggregation(env, scheduledTime);

    const state = d1.db
      .prepare("SELECT * FROM visit_hourly_aggregation_state")
      .get() as Row;
    const expectedEndHour =
      Math.floor((scheduledTime - 12 * 60 * 60 * 1000) / (60 * 60 * 1000)) - 1;
    expect(state.aggregated_until_hour).toBe(expectedEndHour);
    const rollups = d1.db
      .prepare("SELECT hour_bucket AS hourBucket FROM visit_hourly_rollups")
      .all() as Row[];
    expect(rollups).toEqual([{ hourBucket: firstHour }]);
    d1.close();
  });

  it("merges rollups with hot details for overview and trend queries", async () => {
    const { env, d1 } = createEnv();
    const scheduledTime = Date.UTC(2026, 4, 25, 12);
    const coldHourMs = Date.UTC(2026, 4, 24, 20);
    const hotHourMs = Date.UTC(2026, 4, 25, 6);
    insertVisit(d1, {
      visitId: "cold-1",
      visitorId: "visitor-1",
      sessionId: "session-1",
      startedAt: coldHourMs,
      durationMs: 1000,
    });
    insertVisit(d1, {
      visitId: "hot-1",
      visitorId: "visitor-1",
      sessionId: "session-1",
      startedAt: hotHourMs,
      durationMs: 2000,
    });
    insertVisit(d1, {
      visitId: "hot-2",
      visitorId: "visitor-2",
      sessionId: "session-2",
      startedAt: hotHourMs + 1000,
      durationMs: 3000,
    });

    await runHourlyAggregation(env, scheduledTime);

    const window = {
      fromMs: coldHourMs,
      toMs: hotHourMs + 60 * 60 * 1000 - 1,
      nowMs: scheduledTime,
      timeZone: "UTC",
    };
    const overview = await queryOverviewForSitesFromHourlyRollups(
      env,
      ["site-1"],
      window,
    );
    expect(overview?.get("site-1")).toEqual({
      views: 3,
      sessions: 2,
      visitors: 2,
      bounces: 1,
      totalDuration: 6000,
      durationViews: 3,
    });

    const trend = await queryTrendForSitesFromHourlyRollups(
      env,
      ["site-1"],
      window,
      "day",
    );
    expect(trend).toEqual([
      {
        siteId: "site-1",
        bucket: 0,
        timestampMs: Date.UTC(2026, 4, 24),
        views: 1,
        visitors: 1,
        sessions: 1,
        bounces: 0,
        totalDuration: 1000,
        durationViews: 1,
      },
      {
        siteId: "site-1",
        bucket: 1,
        timestampMs: Date.UTC(2026, 4, 25),
        views: 2,
        visitors: 2,
        sessions: 1,
        bounces: 1,
        totalDuration: 5000,
        durationViews: 2,
      },
    ]);
    d1.close();
  });

  it("does not use hourly rollups for lossy trend bucket boundaries", async () => {
    const { env, d1 } = createEnv();
    const scheduledTime = Date.UTC(2026, 4, 25, 12);
    const coldHourMs = Date.UTC(2026, 4, 24, 20);
    insertVisit(d1, {
      visitId: "cold-1",
      visitorId: "visitor-1",
      sessionId: "session-1",
      startedAt: coldHourMs,
      durationMs: 1000,
    });

    await runHourlyAggregation(env, scheduledTime);

    await expect(
      queryTrendForSitesFromHourlyRollups(
        env,
        ["site-1"],
        {
          fromMs: coldHourMs,
          toMs: coldHourMs + 60 * 60 * 1000 - 1,
          nowMs: scheduledTime,
          timeZone: "UTC",
        },
        "minute",
      ),
    ).resolves.toBeNull();
    await expect(
      queryTrendForSitesFromHourlyRollups(
        env,
        ["site-1"],
        {
          fromMs: Date.UTC(2026, 4, 24, 18, 30),
          toMs: Date.UTC(2026, 4, 25, 18, 29, 59, 999),
          nowMs: scheduledTime,
          timeZone: "Asia/Kolkata",
        },
        "day",
      ),
    ).resolves.toBeNull();
    d1.close();
  });
});
