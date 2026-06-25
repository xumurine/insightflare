import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "cloudflare:workers": path.resolve(
        __dirname,
        "./src/test/shims/cloudflare-workers.ts",
      ),
      "server-only": path.resolve(__dirname, "./src/test/shims/server-only.ts"),
    },
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.cache/**",
    ],
    define: {
      BUILD_PERFORMANCE: true,
    },
    coverage: {
      include: [
        "src/app/**/route.ts",
        "src/components/dashboard/**/*.ts",
        "src/hooks/**/*.ts",
        "src/lib/**/*.ts",
        "src/schemas/**/*.ts",
        "src/middleware.ts",
        "src/tracker/sdk.ts",
      ],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/**/__tests__/**",
        "src/**/types.ts",
        "src/**/*types*.ts",
        "src/**/core.ts",
        "src/**/technology.ts",
        "src/**/fact-builder.ts",
        "src/**/analytics.ts",
        "src/**/management.ts",
        "src/lib/i18n/messages.ts",
        "src/tracker/*.min.ts",
        "src/tracker/sdk.no-perf.min.ts",
        "src/lib/edge-client-types/**",
        "src/lib/i18n/messages-types*.ts",
        "src/lib/realtime/demo-site-profiles-types.ts",
        "src/lib/edge/ingest-flush-types.ts",
        "src/lib/edge/ingest-types.ts",
        "src/lib/realtime/mock/events-helpers.ts",
        "src/lib/edge/query.ts",
        "src/lib/system-performance.ts",
        "src/components/dashboard/site-pages/use-dashboard-query.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "cloudflare:workers": path.resolve(
        __dirname,
        "./src/test/shims/cloudflare-workers.ts",
      ),
      "server-only": path.resolve(__dirname, "./src/test/shims/server-only.ts"),
    },
  },
});
