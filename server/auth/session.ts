import type { DatabaseSync } from "node:sqlite";
import { newId } from "../db/client.ts";

export const SESSION_COOKIE = "lab_session";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Account-level role: admin ⊃ teacher ⊃ user. */
export type AccountRole = "admin" | "teacher" | "user";

export type SessionUser = {
  id: string;
  studentNo: string;
  name: string;
  role: AccountRole;
};

export function createSession(db: DatabaseSync, userId: string): { id: string; expiresAt: Date } {
  const id = newId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(
    id,
    userId,
    expiresAt.toISOString(),
  );
  return { id, expiresAt };
}

export function findSessionUser(db: DatabaseSync, sessionId: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.student_no AS studentNo, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(sessionId, new Date().toISOString()) as SessionUser | undefined;
  return row ?? null;
}

export function destroySession(db: DatabaseSync, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

/** Revoke every session belonging to `userId` except `keepSessionId`. */
export function destroyOtherSessions(
  db: DatabaseSync,
  userId: string,
  keepSessionId: string,
): number {
  return Number(
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(userId, keepSessionId)
      .changes,
  );
}

/**
 * Delete session rows past their expiry. `findSessionUser` already ignores
 * them; this just keeps the table bounded. Called once at boot and then on a
 * daily timer by the server entrypoint.
 */
export function sweepExpiredSessions(db: DatabaseSync): number {
  return Number(
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString()).changes,
  );
}

const secureFlag = (secure: boolean) => (secure ? "; Secure" : "");

export function sessionCookieValue(sessionId: string, expiresAt: Date, secure = false): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax${secureFlag(secure)}; Expires=${expiresAt.toUTCString()}`;
}

export function clearedSessionCookie(secure = false): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secureFlag(secure)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
