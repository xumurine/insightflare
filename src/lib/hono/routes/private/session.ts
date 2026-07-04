import { Hono } from "hono";

import { handleAuthMeAdmin } from "@/lib/edge/admin-users";
import type { AppEnv } from "@/lib/hono/types";
import { nf as notFound } from "@/lib/response";

export const privateSessionRoutes = new Hono<AppEnv>();

privateSessionRoutes.get("/", (c) => handleAuthMeAdmin(c.req.raw, c.env));
privateSessionRoutes.all("/*", () => notFound());
