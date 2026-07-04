import { Hono } from "hono";

import {
  handleLegacyAuthLogin,
  handleLegacyAuthLogout,
} from "@/lib/edge/legacy-auth";
import type { AppEnv } from "@/lib/hono/types";
import { nf as notFound } from "@/lib/response";

export const publicSessionRoutes = new Hono<AppEnv>();

publicSessionRoutes.post("/", (c) => handleLegacyAuthLogin(c.req.raw, c.env));
publicSessionRoutes.delete("/", (c) => handleLegacyAuthLogout(c.req.raw));
publicSessionRoutes.all("/*", () => notFound());
