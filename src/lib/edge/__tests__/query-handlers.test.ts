import { describe, expect, it } from "vitest";

import {
  handleEventRecordDetail,
  handleEventsRecords,
  handleEventsSummary,
  handleEventsTrend,
  handleEventTypeDetail,
  handleEventTypeFieldValues,
  handleEventTypes,
} from "@/lib/edge/query/events";
import {
  handleFilterOptions,
  handleOverview,
  handleOverviewClientTab,
  handleOverviewGeoPoints,
  handleOverviewGeoTab,
  handleOverviewPageTab,
  handleOverviewSourceTab,
  handleTrend,
} from "@/lib/edge/query/overview";
import {
  handleDimension,
  handlePages,
  handlePagesDashboard,
  handleReferrers,
} from "@/lib/edge/query/pages";
import type { Env } from "@/lib/edge/types";

const env = {} as Env;
const siteId = "site-1";
const invalidWindow = "from=20&to=10";

function url(search = invalidWindow) {
  return new URL(`https://edge.test/api/private/query?${search}`);
}

async function expectBadRequest(
  response: Response,
  message: string,
): Promise<void> {
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: { message },
  });
}

describe("split edge query page handlers", () => {
  it("rejects invalid time windows before querying D1", async () => {
    await expectBadRequest(
      await handlePages(env, siteId, url(), true),
      "Invalid time window",
    );
    await expectBadRequest(
      await handlePagesDashboard(env, siteId, url()),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleReferrers(env, siteId, url()),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleDimension(env, siteId, url(), "pathname"),
      "Invalid time window",
    );
  });
});

describe("split edge query overview handlers", () => {
  it("rejects invalid time windows before querying D1", async () => {
    await expectBadRequest(
      await handleOverview(env, siteId, url()),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleTrend(env, siteId, url()),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleOverviewPageTab(env, siteId, url(), "path"),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleOverviewSourceTab(env, siteId, url(), "domain"),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleOverviewClientTab(env, siteId, url(), "browser"),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleOverviewGeoTab(env, siteId, url(), "country"),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleOverviewGeoPoints(env, siteId, url()),
      "Invalid time window",
    );
  });

  it("rejects invalid filter option keys before querying D1", async () => {
    await expectBadRequest(
      await handleFilterOptions(env, siteId, url("filterKey=unknown")),
      "Invalid filter key",
    );
  });
});

describe("split edge query event handlers", () => {
  it("rejects invalid time windows before querying D1", async () => {
    await expectBadRequest(
      await handleEventTypes(env, siteId, url()),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleEventsSummary(env, siteId, url()),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleEventsTrend(env, siteId, url()),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleEventsRecords(env, siteId, url()),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleEventTypeDetail(
        env,
        siteId,
        url("eventName=signup&from=20&to=10"),
      ),
      "Invalid time window",
    );
    await expectBadRequest(
      await handleEventTypeFieldValues(
        env,
        siteId,
        url(
          "eventName=signup&fieldPath=/plan&fieldValueType=string&from=20&to=10",
        ),
      ),
      "Invalid time window",
    );
  });

  it("rejects missing event detail parameters before querying D1", async () => {
    await expectBadRequest(
      await handleEventTypeDetail(env, siteId, url("from=1&to=2")),
      "eventName is required",
    );
    await expectBadRequest(
      await handleEventTypeFieldValues(env, siteId, url("eventName=signup")),
      "fieldPath is required",
    );
    await expectBadRequest(
      await handleEventTypeFieldValues(
        env,
        siteId,
        url("eventName=signup&fieldPath=/plan"),
      ),
      "fieldValueType is required",
    );
    await expectBadRequest(
      await handleEventRecordDetail(env, siteId, url("from=1&to=2")),
      "eventId is required",
    );
  });
});
