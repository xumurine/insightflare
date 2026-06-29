import { IngestDurableObject as BaseIngestDurableObject } from "../src/lib/edge/ingest-do";
import apiApp from "../src/lib/hono/app";
import { shouldUseHono } from "../src/lib/hono/path-match";

export class IngestDurableObject extends BaseIngestDurableObject {}

const NEXT_DEV_ORIGIN = "http://127.0.0.1:3000";

function proxyToNextDev(request) {
  const incomingUrl = new URL(request.url);
  const nextUrl = new URL(
    incomingUrl.pathname + incomingUrl.search,
    NEXT_DEV_ORIGIN,
  );
  const headers = new Headers(request.headers);
  headers.set("host", nextUrl.host);
  return fetch(
    new Request(nextUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: request.redirect,
    }),
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (shouldUseHono(url.pathname)) {
      return apiApp.fetch(request, env, ctx);
    }
    return proxyToNextDev(request);
  },
};
