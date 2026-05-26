import { afterEach, describe, expect, it, vi } from "vitest";

import { runHourlyArchive } from "@/lib/edge/archive";
import type { Env } from "@/lib/edge/types";

interface PreparedStatement {
  bind: ReturnType<typeof vi.fn>;
  all?: ReturnType<typeof vi.fn>;
  run?: ReturnType<typeof vi.fn>;
}

interface PreparedStatementWithAll extends PreparedStatement {
  all: ReturnType<typeof vi.fn>;
}

function statementWithAll(
  results: Record<string, unknown>[],
): PreparedStatementWithAll {
  return {
    bind: vi.fn(function (this: PreparedStatement) {
      return this;
    }),
    all: vi.fn().mockResolvedValue({ results }),
  };
}

function statementWithRun(): PreparedStatement {
  return {
    bind: vi.fn(function (this: PreparedStatement) {
      return this;
    }),
    run: vi.fn().mockResolvedValue(undefined),
  };
}

function createArchiveEnv(results: Record<string, unknown>[]) {
  const select = statementWithAll(results);
  const deleteEvents = statementWithRun();
  const insertArchive = statementWithRun();
  const deleteVisit = statementWithRun();
  const prepare = vi.fn((sql: string) => {
    if (sql.includes("SELECT *")) return select;
    if (sql.includes("DELETE FROM custom_events")) return deleteEvents;
    if (sql.includes("INSERT OR REPLACE INTO visits_archive")) {
      return insertArchive;
    }
    if (sql.includes("DELETE FROM visits WHERE visit_id = ?")) {
      return deleteVisit;
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const batch = vi.fn().mockResolvedValue(undefined);

  return {
    env: {
      DB: {
        prepare,
        batch,
      },
    } as unknown as Env,
    select,
    deleteEvents,
    insertArchive,
    deleteVisit,
    prepare,
    batch,
  };
}

function createArchiveEnvWithBatches(
  batches: Record<string, unknown>[][],
): ReturnType<typeof createArchiveEnv> {
  const env = createArchiveEnv([]);
  let selectCalls = 0;
  env.select.all.mockImplementation(() => ({
    results: batches[selectCalls++] ?? [],
  }));
  return env;
}

describe("edge archive task", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns without deleting or batching when there are no eligible visits", async () => {
    const { env, select, prepare, batch } = createArchiveEnv([]);
    const scheduledTime = Date.UTC(2026, 4, 26);

    await runHourlyArchive(env, scheduledTime);

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(select.bind).toHaveBeenCalledWith(
      scheduledTime - 365 * 24 * 60 * 60 * 1000,
      5_000,
    );
    expect(batch).not.toHaveBeenCalled();
  });

  it("moves eligible visits into the archive and deletes originals", async () => {
    const visit = {
      visit_id: "visit-1",
      site_id: "site-1",
      visitor_id: "visitor-1",
      session_id: "session-1",
      status: "closed",
      started_at: 1000,
      last_activity_at: 2000,
      ended_at: 2500,
      finalized_at: 2600,
      pathname: "/docs",
      browser: "Chrome",
    };
    const {
      env,
      select,
      deleteEvents,
      insertArchive,
      deleteVisit,
      prepare,
      batch,
    } = createArchiveEnv([visit]);

    await runHourlyArchive(env, Date.UTC(2026, 4, 26));

    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT *"));
    expect(deleteEvents.bind).toHaveBeenCalledWith(
      Date.UTC(2026, 4, 26) - 365 * 24 * 60 * 60 * 1000,
      5_000,
    );
    const archiveArgs = insertArchive.bind.mock.calls[0];
    expect(archiveArgs?.slice(0, 9)).toEqual([
      "visit-1",
      "site-1",
      "visitor-1",
      "session-1",
      "closed",
      1000,
      2000,
      2500,
      2600,
    ]);
    expect(archiveArgs?.[12]).toBe("/docs");
    expect(archiveArgs).toContain("Chrome");
    expect(deleteVisit.bind).toHaveBeenCalledWith("visit-1");
    expect(batch).toHaveBeenCalledWith([insertArchive, deleteVisit]);
    expect(select.all).toHaveBeenCalledTimes(1);
  });

  it("continues archiving until a partial batch is moved", async () => {
    const fullBatch = Array.from({ length: 5_000 }, (_, index) => ({
      visit_id: `visit-${index}`,
      site_id: "site-1",
      visitor_id: `visitor-${index}`,
      session_id: `session-${index}`,
      status: "closed",
      started_at: index,
      last_activity_at: index,
    }));
    const partialBatch = [
      {
        visit_id: "visit-final",
        site_id: "site-1",
        visitor_id: "visitor-final",
        session_id: "session-final",
        status: "closed",
        started_at: 10_000,
        last_activity_at: 10_000,
      },
    ];
    const { env, select, batch } = createArchiveEnvWithBatches([
      fullBatch,
      partialBatch,
    ]);

    await runHourlyArchive(env, Date.UTC(2026, 4, 26));

    expect(select.all).toHaveBeenCalledTimes(2);
    expect(batch).toHaveBeenCalledTimes(2);
    expect(batch.mock.calls[0]?.[0]).toHaveLength(10_000);
    expect(batch.mock.calls[1]?.[0]).toHaveLength(2);
  });

  it("falls back to Date.now when the scheduled time is invalid", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 4, 26));
    const { env, select } = createArchiveEnv([]);

    await runHourlyArchive(env, Number.NaN);

    expect(select.bind).toHaveBeenCalledWith(
      Date.UTC(2026, 4, 26) - 365 * 24 * 60 * 60 * 1000,
      5_000,
    );
  });
});
