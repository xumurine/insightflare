import { Hono } from "hono";

import type { AppEnv } from "@/lib/hono/types";

import { publicQueryRoutes } from "./query";
import { publicResourceRoutes } from "./resources";
import { publicSessionRoutes } from "./session";

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.route("/session", publicSessionRoutes);
publicRoutes.route("/share", publicQueryRoutes);
publicRoutes.route("/resources", publicResourceRoutes);
