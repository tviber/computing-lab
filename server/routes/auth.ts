import { Hono } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import {
  MAX_PASSWORD_LENGTH,
  hashPassword,
  minPasswordLength,
  verifyPassword,
} from "../auth/password.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import {
  createSession,
  destroyOtherSessions,
  destroySession,
  sessionCookieValue,
  clearedSessionCookie,
  type SessionUser,
} from "../auth/session.ts";
import { withTransaction } from "../db/client.ts";
import { jsonError, membershipsOf, type AppVariables } from "../http/context.ts";
import { readJsonObject, readString } from "../http/validation.ts";

function mePayload(db: Parameters<typeof membershipsOf>[0], user: SessionUser) {
  return {
    user: { id: user.id, studentNo: user.studentNo, name: user.name, role: user.role },
    memberships: membershipsOf(db, user),
  };
}

/**
 * X-Forwarded-* headers are only honored when the deployment declares a
 * trusted proxy (`LAB_TRUST_PROXY=1`, e.g. the Caddy site in deploy/). Direct
 * clients could otherwise spoof them: X-Forwarded-For would let an attacker
 * rotate login-limiter keys to bypass throttling, and X-Forwarded-Proto would
 * let them influence the session cookie's Secure flag.
 */
function trustProxy(): boolean {
  return process.env.LAB_TRUST_PROXY === "1";
}

/**
 * Whether this request reached us over HTTPS — directly or through the
 * trusted reverse proxy (`X-Forwarded-Proto`). `LAB_SECURE_COOKIES=1` forces
 * the flag for deployments that terminate TLS further upstream.
 */
function secureRequest(c: Context<{ Variables: AppVariables }>): boolean {
  if (process.env.LAB_SECURE_COOKIES === "1") return true;
  if (new URL(c.req.url).protocol === "https:") return true;
  return trustProxy() && c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

function clientIp(c: Context<{ Variables: AppVariables }>): string {
  if (trustProxy()) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address || "local";
  } catch {
    // app.request() test contexts carry no socket bindings
    return "local";
  }
}

export function authRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();
  // 10 failed attempts per 5 minutes per (ip, account) — in-memory only.
  const loginLimiter = new SlidingWindowLimiter(10, 5 * 60 * 1000);
  // 5 failed current-password attempts per 15 minutes per (ip, user.id).
  const changePasswordLimiter = new SlidingWindowLimiter(5, 15 * 60 * 1000);

  app.post("/login", async (c) => {
    const body = await readJsonObject(c);
    const studentNo = body ? readString(body, "studentNo") : null;
    const password = body ? readString(body, "password") : null;
    if (studentNo === null || password === null) {
      return jsonError(c, 400, "invalid-body");
    }
    const limitKey = `${clientIp(c)}|${studentNo}`;
    if (loginLimiter.exceeded(limitKey)) {
      return jsonError(c, 429, "too-many-attempts");
    }
    const db = c.get("db");
    const user = db
      .prepare(
        "SELECT id, student_no AS studentNo, name, role, password_hash AS passwordHash FROM users WHERE student_no = ?",
      )
      .get(studentNo) as (SessionUser & { passwordHash: string }) | undefined;
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      loginLimiter.hit(limitKey);
      return jsonError(c, 401, "invalid-credentials");
    }
    loginLimiter.reset(limitKey);
    const session = createSession(db, user.id);
    c.header("Set-Cookie", sessionCookieValue(session.id, session.expiresAt, secureRequest(c)));
    return c.json(mePayload(db, user));
  });

  app.post("/logout", (c) => {
    const sessionId = c.get("sessionId");
    if (sessionId) destroySession(c.get("db"), sessionId);
    c.header("Set-Cookie", clearedSessionCookie(secureRequest(c)));
    return c.json({ ok: true });
  });

  app.post("/change-password", async (c) => {
    const user = c.get("user");
    if (!user) return jsonError(c, 401, "unauthenticated");
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 400, "invalid-body");
    const currentPassword = readString(body, "currentPassword");
    const newPassword = readString(body, "newPassword");
    if (currentPassword === null || newPassword === null) {
      return jsonError(c, 400, "invalid-body");
    }
    const limitKey = `${clientIp(c)}|${user.id}`;
    if (changePasswordLimiter.exceeded(limitKey)) {
      return jsonError(c, 429, "too-many-attempts");
    }
    if (
      newPassword.length < minPasswordLength(user.role) ||
      newPassword.length > MAX_PASSWORD_LENGTH
    ) {
      return jsonError(c, 400, "weak-password");
    }
    if (currentPassword === newPassword) return jsonError(c, 400, "same-password");

    const db = c.get("db");
    const account = db
      .prepare("SELECT password_hash AS passwordHash FROM users WHERE id = ?")
      .get(user.id) as { passwordHash: string } | undefined;
    if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) {
      changePasswordLimiter.hit(limitKey);
      return jsonError(c, 401, "current-password-incorrect");
    }

    changePasswordLimiter.reset(limitKey);
    const passwordHash = await hashPassword(newPassword);
    const sessionId = c.get("sessionId");
    withTransaction(db, () => {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, user.id);
      if (sessionId) destroyOtherSessions(db, user.id, sessionId);
    });
    return c.json({ ok: true });
  });

  app.get("/me", (c) => {
    const user = c.get("user");
    if (!user) return jsonError(c, 401, "unauthenticated");
    return c.json(mePayload(c.get("db"), user));
  });

  return app;
}
