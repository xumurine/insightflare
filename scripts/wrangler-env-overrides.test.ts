import { describe, expect, it } from "vitest";

import { applyWranglerEnvOverrides } from "./wrangler-env-overrides";

const BASE_CONFIG = `name = "insightflare"

[vars]
SESSION_WINDOW_MINUTES = "30" # keep comment

[[d1_databases]]
binding = "DB"
database_name = "insightflare"
database_id = "YOUR_D1_ID"
migrations_dir = "./migrations"

[[kv_namespaces]]
binding = "SITE_SETTINGS_KV"
id = "YOUR_KV_ID"

[env.production]
name = "insightflare-production"

[env.production.vars]
SESSION_WINDOW_MINUTES = "30"

[[env.production.d1_databases]]
binding = "DB"
database_name = "insightflare"
database_id = "PROD_D1_ID"
migrations_dir = "./migrations"
`;

describe("applyWranglerEnvOverrides", () => {
  it("overrides root vars and resource bindings from environment values", () => {
    const result = applyWranglerEnvOverrides(BASE_CONFIG, {
      SESSION_WINDOW_MINUTES: "45",
      INSIGHTFLARE_EDGE_URL: "https://edge.example.com",
      INSIGHTFLARE_D1_DATABASE_ID: "d1-id",
      INSIGHTFLARE_SITE_SETTINGS_KV_ID: "kv-id",
      INSIGHTFLARE_VAR_CUSTOM_FLAG: "enabled",
    });

    expect(result.applied).toEqual([
      "[vars].SESSION_WINDOW_MINUTES",
      "[vars].INSIGHTFLARE_EDGE_URL",
      "[vars].CUSTOM_FLAG",
      "[[d1_databases]].database_id",
      "[[kv_namespaces]].id",
    ]);
    expect(result.content).toContain(
      'SESSION_WINDOW_MINUTES = "45" # keep comment',
    );
    expect(result.content).toContain(
      'INSIGHTFLARE_EDGE_URL = "https://edge.example.com"',
    );
    expect(result.content).toContain('CUSTOM_FLAG = "enabled"');
    expect(result.content).toContain('database_id = "d1-id"');
    expect(result.content).toContain('id = "kv-id"');
  });

  it("overrides root and environment worker names", () => {
    const rootResult = applyWranglerEnvOverrides(BASE_CONFIG, {
      INSIGHTFLARE_WORKER_NAME: "custom-root",
    });
    const envResult = applyWranglerEnvOverrides(
      BASE_CONFIG,
      {
        INSIGHTFLARE_PRODUCTION_WORKER_NAME: "custom-production",
      },
      "production",
    );

    expect(rootResult.content).toContain('name = "custom-root"');
    expect(envResult.content).toContain(
      '[env.production]\nname = "custom-production"',
    );
    expect(envResult.content).toContain('name = "insightflare"');
  });

  it("targets the selected Wrangler environment and supports env-specific names", () => {
    const result = applyWranglerEnvOverrides(
      BASE_CONFIG,
      {
        INSIGHTFLARE_PRODUCTION_D1_DATABASE_ID: "production-d1-id",
        INSIGHTFLARE_PRODUCTION_VAR_INSIGHTFLARE_EDGE_URL:
          "https://prod.example.com",
      },
      "production",
    );

    expect(result.applied).toEqual([
      "[env.production.vars].INSIGHTFLARE_EDGE_URL",
      "[[env.production.d1_databases]].database_id",
    ]);
    expect(result.content).toContain('database_id = "production-d1-id"');
    expect(result.content).toContain(
      'INSIGHTFLARE_EDGE_URL = "https://prod.example.com"',
    );
    expect(result.content).toContain('database_id = "YOUR_D1_ID"');
  });

  it("creates the optional R2 binding when a bucket name is supplied", () => {
    const result = applyWranglerEnvOverrides(BASE_CONFIG, {
      INSIGHTFLARE_ARCHIVE_BUCKET_NAME: "archive",
      INSIGHTFLARE_ARCHIVE_PREVIEW_BUCKET_NAME: "archive-preview",
    });

    expect(result.content).toContain("[[r2_buckets]]");
    expect(result.content).toContain('binding = "ARCHIVE_BUCKET"');
    expect(result.content).toContain('bucket_name = "archive"');
    expect(result.content).toContain('preview_bucket_name = "archive-preview"');
  });
});
