import { Hono } from "hono";

import { handleReleasesCompareRequest } from "@/lib/edge/releases-compare";
import type { AppEnv } from "@/lib/hono/types";
import { nf as notFound } from "@/lib/response";

export const privateReleaseRoutes = new Hono<AppEnv>();

privateReleaseRoutes.get("/compare", (c) =>
  handleReleasesCompareRequest(c.req.raw, c.env),
);
privateReleaseRoutes.all("/*", () => notFound());
