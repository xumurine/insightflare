import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleTrackerScriptRequest } from "@/lib/edge/script-endpoint";
import { resolveEdgeRuntime } from "@/lib/edge/runtime";

import { GET as healthzGET } from "../healthz/route";
import { GET as scriptGET } from "../script.js/route";

vi.mock("@/lib/edge/runtime", () => ({
  resolveEdgeRuntime: vi.fn(),
}));

vi.mock("@/lib/edge/script-endpoint", () => ({
  handleTrackerScriptRequest: vi.fn(),
}));

const resolveEdgeRuntimeMock = vi.mocked(resolveEdgeRuntime);
const handleTrackerScriptRequestMock = vi.mocked(handleTrackerScriptRequest);

describe("edge route wrappers", () => {
  beforeEach(() => {
    resolveEdgeRuntimeMock.mockReset();
    handleTrackerScriptRequestMock.mockReset();
  });

  it("reports health with binding availability", async () => {
    resolveEdgeRuntimeMock.mockResolvedValue({
      env: {
        DB: {},
        INGEST_DO: {},
      },
      ctx: {},
      request: new Request("https://app.test/healthz"),
      url: new URL("https://app.test/healthz"),
    });

    const response = await healthzGET(new Request("https://app.test/healthz"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(payload).toMatchObject({
      ok: true,
      service: "insightflare",
      bindings: {
        d1: true,
        durableObject: true,
        r2Archive: false,
      },
    });
    expect(new Date(payload.now).toString()).not.toBe("Invalid Date");
  });

  it("delegates tracker script requests to the edge script handler", async () => {
    const requestWithCf = new Request("https://app.test/script.js");
    const env = { SITE_SETTINGS_KV: {} };
    resolveEdgeRuntimeMock.mockResolvedValue({
      env,
      ctx: {},
      request: requestWithCf,
      url: new URL("https://app.test/script.js"),
    });
    handleTrackerScriptRequestMock.mockResolvedValue(
      new Response("console.log('tracker');", {
        headers: { "content-type": "application/javascript" },
      }),
    );

    const response = await scriptGET(new Request("https://app.test/script.js"));

    expect(handleTrackerScriptRequestMock).toHaveBeenCalledWith(
      requestWithCf,
      env,
    );
    expect(response.headers.get("content-type")).toBe("application/javascript");
    expect(await response.text()).toBe("console.log('tracker');");
  });
});
