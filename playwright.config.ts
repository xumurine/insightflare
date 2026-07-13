import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.INSIGHTFLARE_E2E_BASE_URL;

if (!baseURL) {
  throw new Error(
    "INSIGHTFLARE_E2E_BASE_URL is required. Start E2E through scripts/e2e.ts.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: process.env.INSIGHTFLARE_E2E_ARTIFACTS || "test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL,
    locale: "zh-CN",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
