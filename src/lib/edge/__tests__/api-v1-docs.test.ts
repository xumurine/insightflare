import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
}

function walk(value: unknown, visit: (value: unknown) => void) {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) walk(item, visit);
  }
}

function pathMatchesTemplate(template: string, path: string): boolean {
  const regex = new RegExp(
    `^${template
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\{[^/]+\\\}/g, "[^/]+")}$`,
  );
  return regex.test(path);
}

describe("api v1 public docs", () => {
  it("generates an OpenAPI contract without deprecated public API shapes", () => {
    const spec = readJson<{
      paths: Record<
        string,
        Record<
          string,
          { operationId?: string; responses?: Record<string, unknown> }
        >
      >;
      components: { schemas: Record<string, unknown> };
    }>("docs/openapi.json");
    const raw = JSON.stringify(spec);

    expect(raw).not.toContain("queryName");
    expect(raw).not.toContain("/analytics/{queryName}");
    expect(raw).not.toContain('"ok"');
    expect(raw).not.toContain("Unix milliseconds");
    expect(raw).not.toContain("Unix ms");
    expect(raw).not.toContain("pageSize");
    expect(raw).not.toContain("sortBy");
    expect(raw).not.toContain("sortDir");
    expect(raw).not.toContain("ifk_live_");
    expect(raw).not.toContain("RateLimit");

    expect(
      Object.keys(spec.components.schemas).some((name) => name.includes("___")),
    ).toBe(false);
    expect(spec.components.schemas.ErrorResponse).toBeDefined();
    expect(spec.components.schemas.PaginatedEnvelope).toBeDefined();
    expect(spec.paths["/api/v1/sites/{siteId}/analytics/schema"]).toBeDefined();
    expect(spec.paths["/api/v1/batch"]).toBeDefined();
    expect(spec.paths["/api/v1/sites/{siteId}/config"]).toBeUndefined();
    expect(spec.paths["/api/v1/sites/{siteId}/script-snippet"]).toBeUndefined();

    const operationIds: string[] = [];
    for (const item of Object.values(spec.paths)) {
      for (const operation of Object.values(item)) {
        if (
          operation &&
          typeof operation === "object" &&
          "operationId" in operation
        ) {
          operationIds.push(String(operation.operationId));
        }
      }
    }
    expect(new Set(operationIds).size).toBe(operationIds.length);

    let errorResponseRefs = 0;
    let paginatedRefs = 0;
    walk(spec, (value) => {
      if (!value || typeof value !== "object" || !("$ref" in value)) return;
      const ref = String((value as { $ref: string }).$ref);
      if (ref.endsWith("/ErrorResponse")) errorResponseRefs += 1;
      if (ref.endsWith("/PaginatedEnvelope")) paginatedRefs += 1;
    });
    expect(errorResponseRefs).toBeGreaterThan(0);
    expect(paginatedRefs).toBeGreaterThan(0);
  });

  it("generates a skills manifest for agents rather than an endpoint catalog", () => {
    const manifest = readJson<{
      openapiUrl?: string;
      discovery?: Record<string, string>;
      taskRecipes?: unknown[];
      endpoints?: unknown;
    }>("docs/skills.json");
    const raw = JSON.stringify(manifest);

    expect(manifest.openapiUrl).toBe("/.well-known/openapi.json");
    expect(manifest.discovery).toMatchObject({
      root: "/api/v1",
      token: "/api/v1/token",
      capabilities: "/api/v1/capabilities",
      analyticsSchema: "/api/v1/sites/{siteId}/analytics/schema",
    });
    expect(Array.isArray(manifest.taskRecipes)).toBe(true);
    expect(manifest.endpoints).toBeUndefined();
    expect(raw).not.toContain("queryName");
    expect(raw).not.toContain("Unix milliseconds");
    expect(raw).not.toContain('"ok"');
    expect(raw).not.toContain("overview?compare=previous_period");
  });

  it("keeps OpenAPI request bodies and key responses concrete", () => {
    const spec = readJson<{
      paths: Record<string, Record<string, any>>;
      components: { schemas: Record<string, unknown> };
    }>("docs/openapi.json");

    const bodySchema = (method: string, path: string) =>
      spec.paths[path]?.[method]?.requestBody?.content?.["application/json"]
        ?.schema?.$ref;
    const responseSchema = (method: string, path: string, status = "200") =>
      spec.paths[path]?.[method]?.responses?.[status]?.content?.[
        "application/json"
      ]?.schema?.$ref;

    expect(bodySchema("post", "/api/v1/sites/{siteId}/funnels")).toBe(
      "#/components/schemas/FunnelCreateInput",
    );
    expect(bodySchema("post", "/api/v1/sites/{siteId}/funnels/analysis")).toBe(
      "#/components/schemas/FunnelAnalysisRequest",
    );
    expect(
      bodySchema("patch", "/api/v1/sites/{siteId}/funnels/{funnelId}"),
    ).toBe("#/components/schemas/FunnelUpdateInput");
    expect(bodySchema("post", "/api/v1/sites/{siteId}/events/search")).toBe(
      "#/components/schemas/EventSearchRequest",
    );

    walk(spec.paths, (value) => {
      if (!value || typeof value !== "object" || !("requestBody" in value)) {
        return;
      }
      expect(
        (
          value as {
            requestBody?: {
              content?: { "application/json"?: { schema?: { $ref?: string } } };
            };
          }
        ).requestBody?.content?.["application/json"]?.schema?.$ref,
      ).not.toBe("#/components/schemas/GenericObjectResponse");
    });

    expect(
      responseSchema("post", "/api/v1/sites/{siteId}/funnels", "201"),
    ).toBe("#/components/schemas/FunnelResponse");
    expect(
      spec.paths["/api/v1/sites/{siteId}/funnels"]?.post?.parameters,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Idempotency-Key",
          in: "header",
        }),
      ]),
    );
    expect(responseSchema("get", "/api/v1/team/usage")).toBe(
      "#/components/schemas/TeamUsageResponse",
    );
    expect(
      responseSchema("get", "/api/v1/sites/{siteId}/analytics/compare"),
    ).toBe("#/components/schemas/AnalyticsCompareResponse");
    expect(
      responseSchema("post", "/api/v1/sites/{siteId}/analytics/explore"),
    ).toBe("#/components/schemas/AnalyticsExploreResponse");
    expect(
      responseSchema("get", "/api/v1/sites/{siteId}/funnels/{funnelId}"),
    ).toBe("#/components/schemas/FunnelResponse");

    expect(spec.components.schemas.CapabilitiesFeatures).toBeDefined();
    expect(spec.components.schemas.CapabilitiesLimits).toBeDefined();
    expect(
      JSON.stringify(spec.components.schemas.CapabilitiesResponse),
    ).toContain("Capabilities");
    expect(JSON.stringify(spec.components.schemas.TimeRangeInput)).toContain(
      "last 7 days",
    );
  });

  it("keeps skills calls aligned with OpenAPI path templates", () => {
    const spec = readJson<{
      paths: Record<string, Record<string, unknown>>;
    }>("docs/openapi.json");
    const manifest = readJson<{
      discovery?: Record<string, string>;
      taskRecipes?: Array<{ calls?: string[] }>;
      endpoints?: unknown;
    }>("docs/skills.json");

    const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
      Object.keys(item)
        .filter((method) =>
          ["get", "post", "patch", "delete", "put"].includes(method),
        )
        .map((method) => ({ method: method.toUpperCase(), path })),
    );
    const hasOperation = (method: string, path: string) =>
      operations.some(
        (operation) =>
          operation.method === method &&
          pathMatchesTemplate(operation.path, path),
      );

    expect(hasOperation("GET", manifest.discovery?.root ?? "")).toBe(true);
    expect(hasOperation("GET", manifest.discovery?.token ?? "")).toBe(true);
    expect(hasOperation("GET", manifest.discovery?.capabilities ?? "")).toBe(
      true,
    );
    expect(hasOperation("GET", manifest.discovery?.analyticsSchema ?? "")).toBe(
      true,
    );

    for (const recipe of manifest.taskRecipes ?? []) {
      for (const call of recipe.calls ?? []) {
        const [method, rawPath] = call.split(/\s+/, 2);
        const path = rawPath.split("?")[0];
        expect(hasOperation(method, path)).toBe(true);
      }
    }
    expect(manifest.endpoints).toBeUndefined();
  });
});
