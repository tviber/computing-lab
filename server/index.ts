/**
 * Minimal Lab Runtime API server.
 *
 *   node server/index.ts            # API on :8788, serves dist/ when built
 *   LAB_PORT=9000 LAB_DB_PATH=…     # env overrides
 *
 * The same process can serve the built SPA (dist/) with history-API fallback
 * for single-process deployments and E2E; production currently uses Caddy for
 * static dist files and this as a separate Node ≥22.13 API service.
 */

import { Hono } from "hono";
import type { Context, Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import { normalizeBasePath } from "../src/shared/basePath.ts";
import { getDb } from "./db/client.ts";
import { sweepExpiredSessions } from "./auth/session.ts";
import { attachDb, attachSession, jsonError, type AppVariables } from "./http/context.ts";
import { authRoutes } from "./routes/auth.ts";
import { adminRoutes } from "./routes/admin.ts";
import { calculatorRoutes } from "./routes/calculator.ts";
import { classMemberRoutes } from "./routes/classMembers.ts";
import { dashboardRoutes } from "./routes/dashboard.ts";
import { taskSheetRoutes } from "./routes/taskSheets.ts";
import { taskAssignmentRoutes } from "./routes/taskAssignments.ts";
import { imageSamplingRoutes } from "./routes/imageSampling.ts";
import { colorQuantizationRoutes } from "./routes/colorQuantization.ts";
import { cpuRoutes } from "./routes/cpu.ts";
import { decodingRoutes } from "./routes/decoding.ts";
import { isSimRoutes } from "./routes/isSim.ts";
import { lunchShiftRoutes } from "./routes/lunchShift.ts";
import { labsRoutes } from "./routes/labs.ts";
import { teacherRoutes } from "./routes/teacher.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const distRoot = resolve(here, "../dist");

const basePath = normalizeBasePath(process.env.VITE_BASE_PATH ?? process.env.BASE_PATH);

/** JSON bodies stay small (drafts, imports, answers); refuse megabyte blobs. */
const BODY_LIMIT_BYTES = 2 * 1024 * 1024;

function stripBasePath(path: string): string {
  if (basePath === "/") return path;
  if (path === basePath) return "/";
  return path.startsWith(`${basePath}/`) ? path.slice(basePath.length) || "/" : path;
}

/** Minimal access log: one line per request, tagged with its request id. */
function accessLog() {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    const start = performance.now();
    try {
      await next();
    } finally {
      const ms = Math.round(performance.now() - start);
      const rid = c.get("requestId") ?? "-";
      console.log(
        `[api] ${rid} ${c.req.method} ${new URL(c.req.url).pathname} ${c.res.status} ${ms}ms`,
      );
    }
  };
}

export function createApp(db: DatabaseSync) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use(
    "/api/*",
    requestId(),
    accessLog(),
    bodyLimit({
      maxSize: BODY_LIMIT_BYTES,
      onError: (c) => jsonError(c, 413, "payload-too-large"),
    }),
    attachDb(db),
    attachSession(),
  );

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api/auth", authRoutes());
  app.route("/api/admin", adminRoutes());
  app.route("/api/classes/:classId/labs/calculator", calculatorRoutes());
  app.route("/api/classes/:classId/labs/image-sampling", imageSamplingRoutes());
  app.route("/api/classes/:classId/labs/color-quantization", colorQuantizationRoutes());
  app.route("/api/classes/:classId/labs/cpu", cpuRoutes());
  app.route("/api/classes/:classId/labs/decoding", decodingRoutes());
  app.route("/api/classes/:classId/labs/is-sim", isSimRoutes());
  app.route("/api/classes/:classId/labs/lunch-shift", lunchShiftRoutes());
  app.route("/api/labs", labsRoutes());
  app.route("/api/teacher", teacherRoutes());
  app.route("/api/classes/:classId/dashboard", dashboardRoutes());
  app.route("/api/classes/:classId/members", classMemberRoutes());
  app.route("/api/task-sheets", taskSheetRoutes());
  app.route("/api/classes/:classId/task-assignments", taskAssignmentRoutes());

  app.notFound((c) => c.json({ error: "not-found" }, 404));
  app.onError((err, c) => {
    console.error(`[api] ${c.get("requestId") ?? "-"}`, err);
    return c.json({ error: "internal-error" }, 500);
  });
  return app;
}

export function createServerApp(db: DatabaseSync) {
  const app = createApp(db);

  if (existsSync(distRoot)) {
    app.use("/*", serveStatic({ root: distRoot, rewriteRequestPath: stripBasePath }));
    // SPA history fallback for extensionless paths. A dotted path is assumed
    // to be an asset and 404s when missing rather than silently receiving
    // index.html; the accepted trade-off is that no app route may contain a
    // "." in its path segment.
    app.get("/*", async (c, next) => {
      const path = stripBasePath(new URL(c.req.url).pathname);
      if (path.includes(".")) return next();
      const html = await readFile(resolve(distRoot, "index.html"), "utf8");
      return c.html(html);
    });
  }
  return app;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(here, "index.ts");
if (isMain) {
  const port = Number(process.env.LAB_PORT ?? 8788);
  const host = process.env.LAB_HOST ?? "0.0.0.0";
  const db = getDb();
  // Expired session rows are ignored on lookup but still swept so the table
  // stays bounded: once at boot, then daily.
  sweepExpiredSessions(db);
  setInterval(
    () => {
      try {
        sweepExpiredSessions(db);
      } catch (err) {
        console.error("[api] session sweep failed:", err);
      }
    },
    24 * 60 * 60 * 1000,
  ).unref();
  serve({ fetch: createServerApp(db).fetch, port, hostname: host }, (info) => {
    console.log(`[lab-server] listening on http://${host}:${info.port}`);
    console.log(`[lab-server] db: ${process.env.LAB_DB_PATH ?? "data/lab.db"}`);
  });
}
