import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  buildCommand: "npm run build:next",
  // Keep default OpenNext Cloudflare behavior; custom route orchestration
  // is done in `workers/cf-worker.js`.
});
