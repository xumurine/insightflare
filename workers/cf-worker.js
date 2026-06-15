import nextWorker from "../.open-next/worker.js";
import { runHourlyAggregation } from "../src/lib/edge/hourly-rollup";
import { IngestDurableObject as BaseIngestDurableObject } from "../src/lib/edge/ingest-do";
import { getScheduledTaskDefinition } from "../src/lib/edge/scheduled-task-registry";
import { runScheduledTask } from "../src/lib/edge/scheduled-task-runner";

async function handleAdminWs(request, env) {
  const incomingUrl = new URL(request.url);
  const siteId = incomingUrl.searchParams.get("siteId") || "default";
  const doId = env.INGEST_DO.idFromName(siteId);
  const stub = env.INGEST_DO.get(doId);
  const forwardUrl = "https://ingest.internal/ws" + incomingUrl.search;
  return stub.fetch(new Request(forwardUrl, request));
}

export class IngestDurableObject extends BaseIngestDurableObject {}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === "/admin/ws") {
      return handleAdminWs(request, env);
    }
    return nextWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    const task = getScheduledTaskDefinition("visit_hourly_rollup");
    ctx.waitUntil(
      runScheduledTask(
        env,
        {
          key: task?.key || "visit_hourly_rollup",
          name: task?.name || "Hourly visit aggregation",
          triggerType: "cron",
        },
        controller.scheduledTime,
        ({ logger }) =>
          runHourlyAggregation(env, controller.scheduledTime, { logger }),
      ),
    );
  },
};
