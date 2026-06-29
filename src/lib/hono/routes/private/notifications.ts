import { Hono } from "hono";

import {
  handleNotificationRead,
  handleNotifications,
  handleNotificationsReadAll,
} from "@/lib/edge/admin-notifications";
import { nf } from "@/lib/edge/admin-response";
import type { AppEnv } from "@/lib/hono/types";
import { requestUrl } from "@/lib/hono/utils/context";

export const privateNotificationRoutes = new Hono<AppEnv>();

privateNotificationRoutes.get("/", (c) =>
  handleNotifications(c.req.raw, c.env, requestUrl(c)),
);
privateNotificationRoutes.patch("/:messageId", (c) =>
  handleNotificationRead(c.req.raw, c.env, c.req.param("messageId").trim()),
);
privateNotificationRoutes.patch("/", (c) =>
  handleNotificationsReadAll(c.req.raw, c.env),
);
privateNotificationRoutes.all("/*", () => nf());
