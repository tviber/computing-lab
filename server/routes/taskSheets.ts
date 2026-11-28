import { Hono } from "hono";
import { jsonError, requireStaff, type AppVariables } from "../http/context.ts";
import { readJsonObject } from "../http/validation.ts";
import { newId, parseJsonColumn } from "../db/client.ts";
import {
  SHEET_LIMITS,
  validateSheetSchema,
  type SheetSchema,
} from "../../src/features/task-sheets/domain/schema.ts";
import type { SessionUser } from "../auth/session.ts";

type SheetRow = {
  id: string;
  owner_user_id: string;
  title: string;
  description: string;
  schema_json: string;
  status: string;
  created_at: string;
  updated_at: string;
};

const EMPTY_SCHEMA: SheetSchema = { version: 1, questions: [] };

function toSheet(row: SheetRow) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    description: row.description,
    schema: parseJsonColumn<SheetSchema>(row.schema_json, EMPTY_SCHEMA),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Owner-scoped access; admins may reach every sheet. */
function canTouch(user: SessionUser, sheet: SheetRow): boolean {
  return user.role === "admin" || sheet.owner_user_id === user.id;
}

function getSheet(c: { get: (k: "db") => import("node:sqlite").DatabaseSync }, id: string) {
  return c.get("db").prepare("SELECT * FROM task_sheets WHERE id = ?").get(id) as
    SheetRow | undefined;
}

function validTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= SHEET_LIMITS.title;
}

function validDescription(value: unknown): value is string {
  return (
    value === undefined || (typeof value === "string" && value.length <= SHEET_LIMITS.description)
  );
}

const EMPTY_SCHEMA_JSON = JSON.stringify({ version: 1, questions: [] });

export function taskSheetRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  // Create a sheet. Starts as an empty draft; the editor PUTs the schema.
  app.post("/", async (c) => {
    const auth = requireStaff(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await readJsonObject(c);
    const title = body?.title;
    const description = body?.description;
    if (!validTitle(title)) return jsonError(c, 400, "invalid-title");
    if (!validDescription(description)) return jsonError(c, 400, "invalid-description");
    const id = newId();
    c.get("db")
      .prepare(
        "INSERT INTO task_sheets (id, owner_user_id, title, description, schema_json) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        id,
        auth.user.id,
        title.trim(),
        typeof description === "string" ? description : "",
        EMPTY_SCHEMA_JSON,
      );
    return c.json({ sheet: toSheet(getSheet(c, id)! as SheetRow) }, 201);
  });

  // List my sheets (admins see everyone's, marked with the owner name).
  app.get("/", (c) => {
    const auth = requireStaff(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const rows =
      auth.user.role === "admin"
        ? (db
            .prepare(
              `SELECT s.*, u.name AS ownerName,
                      (SELECT COUNT(*) FROM task_assignments a WHERE a.sheet_id = s.id) AS assignmentCount
               FROM task_sheets s JOIN users u ON u.id = s.owner_user_id
               ORDER BY s.updated_at DESC`,
            )
            .all() as (SheetRow & { ownerName: string; assignmentCount: number })[])
        : (db
            .prepare(
              `SELECT s.*, u.name AS ownerName,
                      (SELECT COUNT(*) FROM task_assignments a WHERE a.sheet_id = s.id) AS assignmentCount
               FROM task_sheets s JOIN users u ON u.id = s.owner_user_id
               WHERE s.owner_user_id = ?
               ORDER BY s.updated_at DESC`,
            )
            .all(auth.user.id) as (SheetRow & { ownerName: string; assignmentCount: number })[]);
    return c.json({
      sheets: rows.map((row) => ({
        ...toSheet(row),
        ownerName: row.ownerName,
        assignmentCount: row.assignmentCount,
        questionCount: parseJsonColumn<SheetSchema>(row.schema_json, EMPTY_SCHEMA).questions.length,
        // Listing stays light: no question payload needed.
        schema: undefined,
      })),
    });
  });

  app.get("/:id", (c) => {
    const auth = requireStaff(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const row = getSheet(c, c.req.param("id"));
    if (!row || !canTouch(auth.user, row)) return jsonError(c, 404, "sheet-not-found");
    return c.json({ sheet: toSheet(row) });
  });

  // Update title/description/schema/status. Whole-document save — the editor
  // debounces and PUTs the full schema like the lab draft endpoint.
  app.patch("/:id", async (c) => {
    const auth = requireStaff(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const row = getSheet(c, c.req.param("id"));
    if (!row || !canTouch(auth.user, row)) return jsonError(c, 404, "sheet-not-found");
    const patch = await readJsonObject(c);
    if (!patch) return jsonError(c, 400, "invalid-body");

    let title = row.title;
    let description = row.description;
    let schemaJson = row.schema_json;
    let status = row.status;

    if (patch.title !== undefined) {
      if (!validTitle(patch.title)) return jsonError(c, 400, "invalid-title");
      title = patch.title.trim();
    }
    if (patch.description !== undefined) {
      if (!validDescription(patch.description)) return jsonError(c, 400, "invalid-description");
      description = patch.description;
    }
    if (patch.schema !== undefined) {
      // Drafts may hold incomplete questions (empty accept lists, unmarked
      // correct options); completeness is enforced again at assign time.
      const validated = validateSheetSchema(patch.schema, { partial: true });
      if (!validated.ok) return jsonError(c, 400, validated.error);
      schemaJson = JSON.stringify(validated.schema);
    }
    if (patch.status !== undefined) {
      if (patch.status !== "draft" && patch.status !== "published") {
        return jsonError(c, 400, "invalid-status");
      }
      status = patch.status;
    }

    c.get("db")
      .prepare(
        `UPDATE task_sheets SET title = ?, description = ?, schema_json = ?, status = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      )
      .run(title, description, schemaJson, status, row.id);
    return c.json({ sheet: toSheet(getSheet(c, row.id)! as SheetRow) });
  });

  // Clone a sheet into the caller's own library — the future sharing path:
  // teachers share by letting colleagues clone, ownership stays per-account.
  app.post("/:id/clone", (c) => {
    const auth = requireStaff(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const row = getSheet(c, c.req.param("id"));
    if (!row || !canTouch(auth.user, row)) return jsonError(c, 404, "sheet-not-found");
    const id = newId();
    c.get("db")
      .prepare(
        "INSERT INTO task_sheets (id, owner_user_id, title, description, schema_json, status) VALUES (?, ?, ?, ?, ?, 'draft')",
      )
      .run(id, auth.user.id, `${row.title}（副本）`, row.description, row.schema_json);
    return c.json({ sheet: toSheet(getSheet(c, id)! as SheetRow) }, 201);
  });

  // Delete the template. Assignments keep their snapshots (sheet_id SET NULL),
  // so this never corrupts already-collected work.
  app.delete("/:id", (c) => {
    const auth = requireStaff(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const row = getSheet(c, c.req.param("id"));
    if (!row || !canTouch(auth.user, row)) return jsonError(c, 404, "sheet-not-found");
    c.get("db").prepare("DELETE FROM task_sheets WHERE id = ?").run(row.id);
    return c.json({ deleted: row.id });
  });

  return app;
}
