import type { Context } from "hono";
import type { AccountRole } from "../auth/session.ts";
import type { AppVariables } from "./context.ts";

export const STUDENT_NO = /^[A-Za-z0-9_-]{2,32}$/;

/** CSV/表格里常见的中文写法也接受。 */
const ROLE_ALIASES: Record<string, AccountRole> = {
  admin: "admin",
  管理员: "admin",
  teacher: "teacher",
  教师: "teacher",
  user: "user",
  学生: "user",
};

export type JsonRecord = Record<string, unknown>;

export function normalizeRole(raw: string | undefined): AccountRole | null {
  if (raw === undefined || raw.trim() === "") return "user";
  return ROLE_ALIASES[raw.trim()] ?? null;
}

/**
 * Preserve the existing routes' object check, including arrays. Field validators
 * decide the error code so extraction does not change legacy invalid-input responses.
 */
export async function readJsonObject(
  c: Context<{ Variables: AppVariables }>,
): Promise<JsonRecord | null> {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return null;
  return body as JsonRecord;
}

export function readString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

export function readOptionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function readTrimmedNonEmpty(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function readBoolean(record: JsonRecord, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

/** Validate an optional nullable string array (`undefined | null | string[]`). */
export function readOptionalNullableStringArray(
  record: JsonRecord,
  key: string,
): { ok: true; value: string[] | null | undefined } | { ok: false } {
  const value = record[key];
  if (value === undefined || value === null) return { ok: true, value };
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return { ok: false };
  }
  return { ok: true, value };
}
