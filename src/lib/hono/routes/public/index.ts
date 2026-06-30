import { Hono } from "hono";

import { publicApiGate } from "@/lib/hono/middleware/public-api-gate";
import type { AppEnv } from "@/lib/hono/types";

import { publicLoginSecurityRoutes } from "./login-security";
import { publicQueryRoutes } from "./query";
import { publicResourceRoutes } from "./resources";
import { publicSessionRoutes } from "./session";

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.route("/session", publicSessionRoutes);
publicRoutes.route("/login-security", publicLoginSecurityRoutes);
publicRoutes.use("/share/*", publicApiGate());
publicRoutes.route("/share", publicQueryRoutes);
publicRoutes.use("/resources/*", publicApiGate({ allowImageDest: true }));
publicRoutes.route("/resources", publicResourceRoutes);
