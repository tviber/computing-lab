import { Hono } from "hono";
import { jsonError, requireAdmin, type AppVariables } from "../http/context.ts";
import { adminClassesRoutes } from "./adminClasses.ts";
import { adminLabsRoutes } from "./adminLabs.ts";
import { adminUsersRoutes } from "./adminUsers.ts";

export function adminRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", async (c, next) => {
    const auth = requireAdmin(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    return next();
  });

  app.route("/", adminUsersRoutes());
  app.route("/", adminClassesRoutes());
  app.route("/", adminLabsRoutes());

  return app;
}
