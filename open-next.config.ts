import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const cloudflareConfig = defineCloudflareConfig();

export default {
  ...cloudflareConfig,
  buildCommand: "npm run build:next",
  // Keep default OpenNext Cloudflare behavior; custom route orchestration
  // is done in `workers/cf-worker.js`.
};
