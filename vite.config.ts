import path from "node:path";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { parse } from "yaml";

import packageJson from "./package.json";

function ssrMapStubs() {
  const stubPath = path.resolve(
    import.meta.dirname,
    "./src/lib/ssr-map-stubs.tsx",
  );
  const stubs = new Set([
    "react-map-gl/maplibre",
    "@deck.gl/layers",
    "@deck.gl/mapbox",
  ]);

  return {
    name: "insightflare:ssr-map-stubs",
    enforce: "pre" as const,
    resolveId(
      source: string,
      _importer: string | undefined,
      options: { ssr?: boolean },
    ) {
      if (options.ssr && stubs.has(source)) {
        return stubPath;
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const demoMode = mode === "demo" || env.DEMO_MODE === "1" ? "1" : "0";
  const configPath =
    process.env.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH ||
    (demoMode === "1"
      ? "./wrangler.demo.toml"
      : mode === "local" || mode === "development"
        ? "./wrangler.dev.toml"
        : "./wrangler.toml");

  return {
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(packageJson.version),
      "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(
        process.env.COMMIT_SHA || "",
      ),
      "import.meta.env.VITE_DEMO_MODE": JSON.stringify(demoMode),
      "import.meta.env.VITE_INSIGHTFLARE_ANALYTICS_ENGINE_DISABLED":
        JSON.stringify("0"),
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    plugins: [
      {
        name: "yaml-as-json",
        transform(code, id) {
          if (!/\.ya?ml$/.test(id)) return null;
          return {
            code: `export default ${JSON.stringify(parse(code))};`,
            map: null,
          };
        },
      },
      ssrMapStubs(),
      cloudflare({ configPath, viteEnvironment: { name: "ssr" } }),
      tanstackStart(),
      react(),
      tailwindcss(),
    ],
    server: {
      port: 3000,
      strictPort: true,
    },
  };
});
