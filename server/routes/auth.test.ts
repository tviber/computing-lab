import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { authRoutes } from "./auth.ts";

async function setup() {
  const db = openMemoryDb();
  const userId = newId();
  db.prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)").run(
    userId,
    "20260101",
    "张三",
    await hashPassword("old-pass"),
  );
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/auth", authRoutes());
  return { db, userId, app };
}

async function login(app: Hono<{ Variables: AppVariables }>) {
  const response = await app.fetch(
    new Request("http://lab.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentNo: "20260101", password: "old-pass" }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";", 1)[0];
}

describe("password changes", () => {
  it("requires an authenticated session", async () => {
    const { app } = await setup();
    const response = await app.fetch(
      new Request("http://lab.test/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "old-pass", newPassword: "new-pass" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("rejects the wrong current password and preserves the account", async () => {
    const { app, db, userId } = await setup();
    const cookie = await login(app);
    const response = await app.fetch(
      new Request("http://lab.test/api/auth/change-password", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "not-old", newPassword: "new-pass" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "current-password-incorrect" });
    const row = db
      .prepare("SELECT password_hash AS passwordHash FROM users WHERE id = ?")
      .get(userId) as { passwordHash: string };
    expect(await verifyPassword("old-pass", row.passwordHash)).toBe(true);
  });

  it("updates the password while keeping the current session valid", async () => {
    const { app, db, userId } = await setup();
    const cookie = await login(app);
    const response = await app.fetch(
      new Request("http://lab.test/api/auth/change-password", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "old-pass", newPassword: "new-pass" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const row = db
      .prepare("SELECT password_hash AS passwordHash FROM users WHERE id = ?")
      .get(userId) as { passwordHash: string };
    expect(await verifyPassword("old-pass", row.passwordHash)).toBe(false);
    expect(await verifyPassword("new-pass", row.passwordHash)).toBe(true);

    const me = await app.fetch(new Request("http://lab.test/api/auth/me", { headers: { cookie } }));
    expect(me.status).toBe(200);
  });

  it("rejects a repeated password and weak new password", async () => {
    const { app } = await setup();
    const cookie = await login(app);
    const same = await app.fetch(
      new Request("http://lab.test/api/auth/change-password", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "old-pass", newPassword: "old-pass" }),
      }),
    );
    expect(same.status).toBe(400);
    expect(await same.json()).toEqual({ error: "same-password" });

    const weak = await app.fetch(
      new Request("http://lab.test/api/auth/change-password", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "old-pass", newPassword: "123" }),
      }),
    );
    expect(weak.status).toBe(400);
    expect(await weak.json()).toEqual({ error: "weak-password" });
  });
});

describe("login rate limiting", () => {
  it("throttles after 10 failed attempts and resets the counter on success", async () => {
    const { app } = await setup();

    for (let i = 0; i < 9; i += 1) {
      const fail = await app.fetch(
        new Request("http://lab.test/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ studentNo: "20260101", password: "wrong" }),
        }),
      );
      expect(fail.status).toBe(401);
    }

    // A successful login before hitting the limit resets the counter.
    await login(app);

    for (let i = 0; i < 10; i += 1) {
      const fail = await app.fetch(
        new Request("http://lab.test/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ studentNo: "20260101", password: "wrong" }),
        }),
      );
      expect(fail.status).toBe(401);
    }

    const blocked = await app.fetch(
      new Request("http://lab.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentNo: "20260101", password: "old-pass" }),
      }),
    );
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "too-many-attempts" });
  });
});

describe("password change session revocation and rate limiting", () => {
  it("revokes other sessions on password change while keeping the current session valid", async () => {
    const { app } = await setup();
    const cookieA = await login(app);
    const cookieB = await login(app);

    const change = await app.fetch(
      new Request("http://lab.test/api/auth/change-password", {
        method: "POST",
        headers: { cookie: cookieA, "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "old-pass", newPassword: "new-pass" }),
      }),
    );
    expect(change.status).toBe(200);

    const meA = await app.fetch(
      new Request("http://lab.test/api/auth/me", { headers: { cookie: cookieA } }),
    );
    expect(meA.status).toBe(200);

    const meB = await app.fetch(
      new Request("http://lab.test/api/auth/me", { headers: { cookie: cookieB } }),
    );
    expect(meB.status).toBe(401);

    const oldLogin = await app.fetch(
      new Request("http://lab.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentNo: "20260101", password: "old-pass" }),
      }),
    );
    expect(oldLogin.status).toBe(401);

    const newLogin = await app.fetch(
      new Request("http://lab.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentNo: "20260101", password: "new-pass" }),
      }),
    );
    expect(newLogin.status).toBe(200);
  });

  it("throttles repeated wrong current passwords and recovers after window expiry or success", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-28T00:00:00.000Z"));
    try {
      const { app } = await setup();
      const cookie = await login(app);

      for (let i = 0; i < 5; i += 1) {
        const wrong = await app.fetch(
          new Request("http://lab.test/api/auth/change-password", {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ currentPassword: "wrong", newPassword: "new-pass" }),
          }),
        );
        expect(wrong.status).toBe(401);
        expect(await wrong.json()).toEqual({ error: "current-password-incorrect" });
      }

      const throttled = await app.fetch(
        new Request("http://lab.test/api/auth/change-password", {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ currentPassword: "old-pass", newPassword: "new-pass" }),
        }),
      );
      expect(throttled.status).toBe(429);
      expect(await throttled.json()).toEqual({ error: "too-many-attempts" });

      // Advance past the 15-minute window: attempts recover.
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);

      const recovered = await app.fetch(
        new Request("http://lab.test/api/auth/change-password", {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ currentPassword: "old-pass", newPassword: "new-pass" }),
        }),
      );
      expect(recovered.status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});
