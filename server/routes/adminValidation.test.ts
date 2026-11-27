// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AccountRole } from "../auth/session.ts";
import { openMemoryDb } from "../db/client.ts";
import type { AppVariables } from "../http/context.ts";
import { adminRoutes } from "./admin.ts";

function appFor(role: AccountRole | null = "admin") {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", role ? { id: "caller", studentNo: "caller", name: "Caller", role } : null);
    await next();
  });
  app.route("/api/admin", adminRoutes());
  return app;
}

describe("extracted admin request contracts", () => {
  it.each([
    ["/users", "[]", "invalid-body"],
    ["/classes", "[]", "invalid-name"],
    ["/users/import", "[]", "invalid-import"],
    ["/users", "null", "invalid-body"],
    ["/classes", "null", "invalid-body"],
    ["/users/import", "null", "invalid-body"],
    ["/users", "{", "invalid-body"],
    ["/classes", "{", "invalid-body"],
    ["/users/import", "{", "invalid-body"],
  ])("preserves %s's response for %s", async (path, body, error) => {
    const response = await appFor().request(`/api/admin${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
  });

  it("preserves per-row errors when a JSON import contains non-account values", async () => {
    const db = openMemoryDb();
    try {
      const app = new Hono<{ Variables: AppVariables }>();
      app.use("*", async (c, next) => {
        c.set("db", db);
        await next();
      });
      app.route("/", appFor());
      const response = await app.request("/api/admin/users/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ users: [[], null, { role: "invalid" }] }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        created: 0,
        exists: 0,
        failed: 3,
        rows: [
          { line: 1, studentNo: "", status: "error", error: "invalid-student-no" },
          { line: 2, studentNo: "", status: "error", error: "invalid-row" },
          { line: 3, studentNo: "", status: "error", error: "invalid-role" },
        ],
      });
    } finally {
      db.close();
    }
  });

  it.each([null, "user", "teacher"] as const)(
    "guards all three mounted subrouters against %s callers",
    async (role) => {
      const app = appFor(role);
      for (const [method, path] of [
        ["GET", "/users"],
        ["GET", "/classes"],
        ["PUT", "/labs/calculator/visibility"],
        ["GET", "/users/student/labs/calculator/canvas"],
      ]) {
        const response = await app.request(`/api/admin${path}`, { method });
        expect(response.status).toBe(role === null ? 401 : 403);
        expect(await response.json()).toEqual({
          error: role === null ? "unauthenticated" : "admin-required",
        });
      }
    },
  );
});
