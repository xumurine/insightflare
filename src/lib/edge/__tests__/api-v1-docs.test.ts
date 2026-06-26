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
  });
});
