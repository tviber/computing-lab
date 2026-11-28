import type { DatabaseSync } from "node:sqlite";
import { parseJsonColumn } from "./json.ts";

/** Oldest on-disk schema this build promises to upgrade in place. */
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;

/** Bump alongside a new step in `MIGRATION_STEPS`. */
export const SCHEMA_VERSION = 22;

export interface MigrationStep {
  targetVersion: number;
  apply(db: DatabaseSync): void;
}

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as {
    name: string;
  }[];
  return rows.some((row) => row.name === column);
}

function shiftLogisticRegressionStageMap(raw: string): string {
  const parsed = parseJsonColumn<Record<string, unknown>>(raw, {});
  const shifted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const num = Number(key);
    const nextKey = Number.isInteger(num) && num >= 1 && num <= 5 ? String(num + 1) : key;
    shifted[nextKey] = value;
  }
  return JSON.stringify(shifted);
}

/**
 * Every persisted schema change, in order. A database at version N replays
 * each step whose target is greater than N, so historical resets and payload
 * rewrites stay intact. Never delete or squash a released step without an
 * explicit production-data decision recorded in docs/database-migrations.md.
 */
export const MIGRATION_STEPS: readonly MigrationStep[] = [
  {
    // v1 -> v2: out-of-order stage passes replace the serial stage lock.
    targetVersion: 2,
    apply(db) {
      if (!hasColumn(db, "student_projects", "passed_stages")) {
        db.exec("ALTER TABLE student_projects ADD COLUMN passed_stages TEXT NOT NULL DEFAULT '[]'");
      }
    },
  },
  {
    // v2 -> v3: account-level roles (admin / teacher / user). Existing class
    // teachers keep their permissions via a global 'teacher' role backfill.
    targetVersion: 3,
    apply(db) {
      if (!hasColumn(db, "users", "role")) {
        db.exec(
          "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' " +
            "CHECK (role IN ('admin', 'teacher', 'user'))",
        );
      }
      db.exec(
        "UPDATE users SET role = 'teacher' " +
          "WHERE id IN (SELECT user_id FROM class_members WHERE role = 'teacher')",
      );
    },
  },
  {
    // v3 -> v4: task sheets — teacher-owned worksheet templates, class-scoped
    // assignments (schema snapshot at assign time), per-student responses.
    targetVersion: 4,
    apply(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS task_sheets (
        id            TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users (id),
        title         TEXT NOT NULL,
        description   TEXT NOT NULL DEFAULT '',
        schema_json   TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`);
      db.exec(`CREATE TABLE IF NOT EXISTS task_assignments (
        id          TEXT PRIMARY KEY,
        sheet_id    TEXT REFERENCES task_sheets (id) ON DELETE SET NULL,
        class_id    TEXT NOT NULL REFERENCES classes (id),
        assigned_by TEXT NOT NULL REFERENCES users (id),
        title       TEXT NOT NULL,
        schema_json TEXT NOT NULL,
        due_at      TEXT,
        archived    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`);
      db.exec(`CREATE TABLE IF NOT EXISTS task_responses (
        id             TEXT PRIMARY KEY,
        assignment_id  TEXT NOT NULL REFERENCES task_assignments (id),
        user_id        TEXT NOT NULL REFERENCES users (id),
        answers_json   TEXT NOT NULL DEFAULT '{}',
        auto_score     REAL,
        auto_total     REAL,
        grading_json   TEXT,
        review_json    TEXT,
        reviewed_by    TEXT,
        reviewed_at    TEXT,
        final_score    REAL,
        final_total    REAL,
        status         TEXT NOT NULL DEFAULT 'in_progress'
                       CHECK (status IN ('in_progress', 'submitted', 'reviewed', 'returned')),
        submitted_at   TEXT,
        updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (assignment_id, user_id)
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_task_sheets_owner ON task_sheets (owner_user_id)");
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_task_assignments_class ON task_assignments (class_id)",
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_task_assignments_sheet ON task_assignments (sheet_id)",
      );
      db.exec("CREATE INDEX IF NOT EXISTS idx_task_responses_user ON task_responses (user_id)");
    },
  },
  {
    // v4 -> v5: covering index for the dashboard's "latest submission per
    // stage" lookup, which scans submissions filtered by
    // (user_id, lab_id, stage_index).
    targetVersion: 5,
    apply(db) {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_submissions_user_stage
        ON submissions (user_id, lab_id, stage_index, submitted_at DESC)`);
    },
  },
  {
    // v5 -> v6: lab_settings — per-lab admin visibility switch. A missing
    // row means the lab is open.
    targetVersion: 6,
    apply(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS lab_settings (
        lab_id     TEXT PRIMARY KEY,
        hidden     INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`);
    },
  },
  {
    // v6 -> v7: open_class_ids scopes an open lab to selected classes — NULL
    // stays "every class" so existing open labs keep their audience.
    targetVersion: 7,
    apply(db) {
      if (!hasColumn(db, "lab_settings", "open_class_ids")) {
        db.exec("ALTER TABLE lab_settings ADD COLUMN open_class_ids TEXT");
      }
    },
  },
  {
    // v7 -> v8: lab_class_settings — teacher-level per-class lab switch
    // layered under the admin scope; open = 0 closes the lab for that
    // class's students.
    targetVersion: 8,
    apply(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS lab_class_settings (
        lab_id     TEXT NOT NULL,
        class_id   TEXT NOT NULL REFERENCES classes (id),
        open       INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (lab_id, class_id)
      )`);
    },
  },
  {
    // v8 -> v9: immutable CPU guided first picks, stored before grading so
    // refreshes and forged /judge payloads cannot replace the teacher record.
    targetVersion: 9,
    apply(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS cpu_guided_first_answers (
        project_id  TEXT NOT NULL REFERENCES student_projects (id) ON DELETE CASCADE,
        stage_index INTEGER NOT NULL CHECK (stage_index > 0),
        prompt_id   TEXT NOT NULL,
        option_index INTEGER NOT NULL CHECK (option_index >= 0),
        recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (project_id, stage_index, prompt_id)
      )`);
    },
  },
  {
    // v9 -> v10: the cpu lab was re-cut into the 点餐机 three-stage mainline
    // (issue #100) — old stage indices map to different stages now, so
    // project progress, drafts, first-pick rows and submissions all reset.
    // The lab is default-hidden; submissions are cheap practice records.
    targetVersion: 10,
    apply(db) {
      db.exec(
        "UPDATE student_projects SET passed_stages='[]', current_stage=1, draft_graph='{}' " +
          "WHERE lab_id='cpu'",
      );
      db.exec("DELETE FROM submissions WHERE lab_id='cpu'");
      db.exec(
        "DELETE FROM cpu_guided_first_answers WHERE project_id IN " +
          "(SELECT id FROM student_projects WHERE lab_id='cpu')",
      );
    },
  },
  {
    // v10 -> v11: per-stage draft revision counters for stale-write fencing.
    targetVersion: 11,
    apply(db) {
      if (!hasColumn(db, "student_projects", "draft_revisions")) {
        db.exec(
          "ALTER TABLE student_projects ADD COLUMN draft_revisions TEXT NOT NULL DEFAULT '{}'",
        );
      }
    },
  },
  {
    // v11 -> v12: the lunch-shift lab was rebuilt around word tables and a
    // priority function (four new stage indices) — old progress, drafts and
    // submissions map to nothing meaningful, so they reset like cpu did.
    targetVersion: 12,
    apply(db) {
      db.exec(
        "UPDATE student_projects SET passed_stages='[]', current_stage=1, " +
          "draft_graph='{}', draft_revisions='{}' WHERE lab_id='lunch-shift'",
      );
      db.exec("DELETE FROM submissions WHERE lab_id='lunch-shift'");
    },
  },
  {
    // v12 -> v13: stage 5 (附加挑战) was rescored around expected bad
    // reviews and stage 4's rush lever was removed — old stage-5
    // submissions/drafts carry a stale model and drop; stages 1–4 stay.
    targetVersion: 13,
    apply(db) {
      db.exec("DELETE FROM submissions WHERE lab_id='lunch-shift' AND stage_index=5");
      // current_stage is recomputed like nextLunchStage: the first of
      // 1..5 not passed, else 6 — the passed_stages subquery keeps the
      // pre-update row value, so it filters out 5 the same way.
      db.exec(
        "UPDATE student_projects SET " +
          "passed_stages=(SELECT json_group_array(value) FROM json_each(passed_stages) " +
          "WHERE value != 5), " +
          "draft_graph=json_remove(draft_graph, '$.\"5\"'), " +
          "draft_revisions=json_remove(draft_revisions, '$.\"5\"'), " +
          "current_stage=(SELECT COALESCE(MIN(j.value), 6) FROM json_each('[1,2,3,4,5]') j " +
          "WHERE j.value NOT IN " +
          "(SELECT value FROM json_each(passed_stages) WHERE value != 5)) " +
          "WHERE lab_id='lunch-shift'",
      );
    },
  },
  {
    // v13 -> v14: stage 5 gained a price argument (refunds now cost the
    // order's own price) — the 124-cell tables and old scores are stale.
    targetVersion: 14,
    apply(db) {
      db.exec("DELETE FROM submissions WHERE lab_id='lunch-shift' AND stage_index=5");
      db.exec(
        "UPDATE student_projects SET " +
          "passed_stages=(SELECT json_group_array(value) FROM json_each(passed_stages) " +
          "WHERE value != 5), " +
          "draft_graph=json_remove(draft_graph, '$.\"5\"'), " +
          "draft_revisions=json_remove(draft_revisions, '$.\"5\"'), " +
          "current_stage=(SELECT COALESCE(MIN(j.value), 6) FROM json_each('[1,2,3,4,5]') j " +
          "WHERE j.value NOT IN " +
          "(SELECT value FROM json_each(passed_stages) WHERE value != 5)) " +
          "WHERE lab_id='lunch-shift'",
      );
    },
  },
  {
    // v14 -> v15: stage 2 became AI intake practice and stage 4 became
    // the combined dinner-rush challenge — old stage-2 word-table
    // submissions/drafts and old stage-4 verdicts map to nothing
    // meaningful, so both slots reset while stages 1, 3, 5 survive.
    targetVersion: 15,
    apply(db) {
      db.exec("DELETE FROM submissions WHERE lab_id='lunch-shift' AND stage_index IN (2, 4)");
      db.exec(
        "UPDATE student_projects SET " +
          "passed_stages=(SELECT json_group_array(value) FROM json_each(passed_stages) " +
          "WHERE value NOT IN (2, 4)), " +
          "draft_graph=json_remove(draft_graph, '$.\"2\"', '$.\"4\"'), " +
          "draft_revisions=json_remove(draft_revisions, '$.\"2\"', '$.\"4\"'), " +
          "current_stage=(SELECT COALESCE(MIN(j.value), 6) FROM json_each('[1,2,3,4,5]') j " +
          "WHERE j.value NOT IN " +
          "(SELECT value FROM json_each(passed_stages) WHERE value NOT IN (2, 4))) " +
          "WHERE lab_id='lunch-shift'",
      );
    },
  },
  {
    // v15 -> v16: stage 3's grade moved from one 12-order simulated
    // round to the 12-probe layered battery — naive urgent-first tables
    // that used to pass now score ~3, so stage-3 verdicts rescore.
    targetVersion: 16,
    apply(db) {
      db.exec("DELETE FROM submissions WHERE lab_id='lunch-shift' AND stage_index = 3");
      db.exec(
        "UPDATE student_projects SET " +
          "passed_stages=(SELECT json_group_array(value) FROM json_each(passed_stages) " +
          "WHERE value != 3), " +
          "draft_graph=json_remove(draft_graph, '$.\"3\"'), " +
          "draft_revisions=json_remove(draft_revisions, '$.\"3\"'), " +
          "current_stage=(SELECT COALESCE(MIN(j.value), 6) FROM json_each('[1,2,3,4,5]') j " +
          "WHERE j.value NOT IN " +
          "(SELECT value FROM json_each(passed_stages) WHERE value != 3)) " +
          "WHERE lab_id='lunch-shift'",
      );
    },
  },
  {
    // v16 -> v17: ml-intro prepended a Stage 1 intuition-strategy game and shifted
    // the original 5 stages (tokenize..generalize) from 1..5 to 2..6. Shift existing
    // student submissions, passed_stages, drafts, and revisions forward so prior
    // work aligns with the 6-stage curriculum instead of colliding with Stage 1.
    targetVersion: 17,
    apply(db) {
      db.exec(
        "UPDATE submissions SET stage_index = stage_index + 1 " +
          "WHERE lab_id = 'ml-intro' AND stage_index BETWEEN 1 AND 5",
      );
      const projects = db
        .prepare(
          "SELECT id, passed_stages, draft_graph, draft_revisions FROM student_projects " +
            "WHERE lab_id = 'ml-intro'",
        )
        .all() as {
        id: string;
        passed_stages: string;
        draft_graph: string;
        draft_revisions: string;
      }[];
      const updateStmt = db.prepare(
        "UPDATE student_projects SET passed_stages = ?, current_stage = ?, draft_graph = ?, draft_revisions = ? " +
          "WHERE id = ?",
      );
      for (const row of projects) {
        const shiftedPassed = Array.from(
          new Set(
            parseJsonColumn<number[]>(row.passed_stages, [])
              .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5)
              .map((n) => n + 1),
          ),
        ).sort((a, b) => a - b);
        let nextStage = 7;
        for (let stage = 1; stage <= 6; stage += 1) {
          if (!shiftedPassed.includes(stage)) {
            nextStage = stage;
            break;
          }
        }
        updateStmt.run(
          JSON.stringify(shiftedPassed),
          nextStage,
          shiftLogisticRegressionStageMap(row.draft_graph),
          shiftLogisticRegressionStageMap(row.draft_revisions),
          row.id,
        );
      }
    },
  },
  {
    // v17 -> v18: monotonic per-project generation counter incremented on staff reset,
    // fencing off stale pre-reset autosaves and judge requests even when revisions start over at 0.
    targetVersion: 18,
    apply(db) {
      if (!hasColumn(db, "student_projects", "project_generation")) {
        db.exec(
          "ALTER TABLE student_projects ADD COLUMN project_generation INTEGER NOT NULL DEFAULT 0",
        );
      }
    },
  },
  {
    // v18 -> v19: retire the separate evaluation stages, move the surviving
    // submission to Stage 5/7, and fence old autosaves with a generation bump.
    targetVersion: 19,
    apply(db) {
      db.exec(`
        UPDATE submissions SET stage_index = 7 WHERE lab_id = 'ml-intro' AND stage_index = 5;
        UPDATE submissions SET stage_index = 5
        WHERE lab_id = 'ml-intro' AND stage_index = 6 AND passed = 1;
      `);
      const projects = db
        .prepare(
          `SELECT id, passed_stages, draft_graph, draft_revisions
         FROM student_projects WHERE lab_id = 'ml-intro'`,
        )
        .all() as {
        id: string;
        passed_stages: string;
        draft_graph: string;
        draft_revisions: string;
      }[];
      const update = db.prepare(
        `UPDATE student_projects
         SET passed_stages = ?, current_stage = ?, draft_graph = ?, draft_revisions = ?,
             project_generation = project_generation + 1
         WHERE id = ?`,
      );
      for (const project of projects) {
        const oldPassed = parseJsonColumn<number[]>(project.passed_stages, []);
        const passed = [1, 2, 3, 4].filter((index) => oldPassed.includes(index));
        if (oldPassed.includes(6)) passed.push(5);
        const drafts = parseJsonColumn<Record<string, unknown>>(project.draft_graph, {});
        const revisions = parseJsonColumn<Record<string, unknown>>(project.draft_revisions, {});
        delete drafts[5];
        delete drafts[6];
        delete revisions[5];
        delete revisions[6];
        const next = [1, 2, 3, 4, 5].find((index) => !passed.includes(index)) ?? 6;
        update.run(
          JSON.stringify(passed),
          next,
          JSON.stringify(drafts),
          JSON.stringify(revisions),
          project.id,
        );
      }
    },
  },
  {
    // v19 -> v20: rename the lab after the curriculum moved from "ML intro"
    // to the dedicated logistic-regression unit.
    targetVersion: 20,
    apply(db) {
      db.exec(`
        UPDATE student_projects SET lab_id = 'logistic-regression' WHERE lab_id = 'ml-intro';
        UPDATE submissions SET lab_id = 'logistic-regression' WHERE lab_id = 'ml-intro';
        UPDATE lab_settings SET lab_id = 'logistic-regression' WHERE lab_id = 'ml-intro';
        UPDATE lab_class_settings SET lab_id = 'logistic-regression' WHERE lab_id = 'ml-intro';
      `);
    },
  },
  {
    // v20 -> v21: drop drafts and probe text tied to the retired evaluation stages.
    targetVersion: 21,
    apply(db) {
      db.exec(`
        UPDATE student_projects
        SET draft_graph = json_remove(draft_graph, '$."5"', '$."6"')
        WHERE lab_id = 'logistic-regression' AND json_valid(draft_graph);
        UPDATE student_projects
        SET draft_revisions = json_remove(draft_revisions, '$."5"', '$."6"')
        WHERE lab_id = 'logistic-regression' AND json_valid(draft_revisions);
        UPDATE submissions
        SET snapshot_graph = json_remove(snapshot_graph, '$.probeText')
        WHERE lab_id = 'logistic-regression' AND stage_index BETWEEN 5 AND 7
          AND json_valid(snapshot_graph);
      `);
    },
  },
  {
    // v21 -> v22: one-time acknowledgement for the calculator full-adder guide.
    targetVersion: 22,
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS calculator_full_adder_guide_acknowledgements (
          user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE
        );
      `);
    },
  },
];
