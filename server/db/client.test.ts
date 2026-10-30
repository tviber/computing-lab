import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, SCHEMA_VERSION } from "./client.ts";

const here = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(resolve(here, "schema.sql"), "utf8");

/**
 * Rebuild a database as it looked at `version`: apply today's schema, then
 * strip every object that did not exist yet. Cheaper and more faithful than
 * hand-writing historical DDL.
 */
function fixtureDb(version: number): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schemaSql);
  if (version < 9) db.exec("DROP TABLE IF EXISTS cpu_guided_first_answers");
  if (version < 8) db.exec("DROP TABLE IF EXISTS lab_class_settings");
  if (version < 7) db.exec("ALTER TABLE lab_settings DROP COLUMN open_class_ids");
  if (version < 6) db.exec("DROP TABLE lab_settings");
  if (version < 5) db.exec("DROP INDEX IF EXISTS idx_submissions_user_stage");
  if (version < 4) {
    db.exec("DROP TABLE task_responses");
    db.exec("DROP TABLE task_assignments");
    db.exec("DROP TABLE task_sheets");
  }
  if (version < 3) db.exec("ALTER TABLE users DROP COLUMN role");
  if (version < 2) db.exec("ALTER TABLE student_projects DROP COLUMN passed_stages");
  db.exec(`PRAGMA user_version = ${version}`);
  return db;
}

const versionOf = (db: DatabaseSync) =>
  (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;

const tableExists = (db: DatabaseSync, name: string) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
  undefined;

describe("migrate", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
    "upgrades a v%i database to the current schema",
    (version) => {
      const db = fixtureDb(version);
      migrate(db);

      expect(versionOf(db)).toBe(SCHEMA_VERSION);
      for (const table of [
        "task_sheets",
        "task_assignments",
        "task_responses",
        "cpu_guided_first_answers",
      ]) {
        expect(tableExists(db, table), table).toBe(true);
      }
      // v2/v3 columns exist after the chain ran.
      expect(db.prepare("SELECT passed_stages FROM student_projects LIMIT 0")).toBeDefined();
      expect(db.prepare("SELECT role FROM users LIMIT 0")).toBeDefined();
      expect(
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
          .get("idx_submissions_user_stage"),
      ).toBeDefined();
      db.close();
    },
  );

  it("resets cpu progress and submissions when a v9 db upgrades (issue #100)", () => {
    // The issue-#100 re-cut reindexes every cpu stage, so old indices map to
    // different stages — progress, drafts and submissions must not carry.
    const db = fixtureDb(9);
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES ('c1', 'class', 'inv')").run();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES ('u1', 'no1', 'n', 'h', 'user')",
    ).run();
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage, passed_stages, draft_graph) " +
        "VALUES ('p1', 'u1', 'c1', 'cpu', 5, '[1,2,3,4]', '{\"1\":{}}')",
    ).run();
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage, passed_stages) " +
        "VALUES ('p2', 'u1', 'c1', 'calculator', 7, '[1,2,3,4,5,6]')",
    ).run();
    db.prepare(
      "INSERT INTO submissions (id, project_id, user_id, lab_id, stage_index, snapshot_graph, score, total, passed, test_summary) " +
        "VALUES ('s1', 'p1', 'u1', 'cpu', 2, '{}', 2, 2, 1, '{}')",
    ).run();
    db.prepare(
      "INSERT INTO cpu_guided_first_answers (project_id, stage_index, prompt_id, option_index) " +
        "VALUES ('p1', 2, 'first-fetch', 0)",
    ).run();

    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    const cpu = db
      .prepare(
        "SELECT passed_stages, current_stage, draft_graph FROM student_projects WHERE id='p1'",
      )
      .get() as { passed_stages: string; current_stage: number; draft_graph: string };
    expect(cpu.passed_stages).toBe("[]");
    expect(cpu.current_stage).toBe(1);
    expect(cpu.draft_graph).toBe("{}");
    // Other labs' progress is untouched.
    expect(
      (
        db.prepare("SELECT passed_stages FROM student_projects WHERE id='p2'").get() as {
          passed_stages: string;
        }
      ).passed_stages,
    ).toBe("[1,2,3,4,5,6]");
    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE lab_id='cpu'").get() as {
          n: number;
        }
      ).n,
    ).toBe(0);
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM cpu_guided_first_answers").get() as { n: number }).n,
    ).toBe(0);
    db.close();
  });

  it("drops lunch-shift stage-5 leftovers and recomputes current_stage (v12 -> v13)", () => {
    // Stage 5 was rescored and stage 4's rush lever removed: old stage-5
    // submissions/drafts carry a stale model, and a student who had passed
    // everything ends up with current_stage pointing past a stage that is
    // no longer passed.
    const db = fixtureDb(12);
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES ('c1', 'class', 'inv')").run();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES ('u1', 'no1', 'n', 'h', 'user')",
    ).run();
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage, passed_stages, draft_graph, draft_revisions) " +
        'VALUES (\'p1\', \'u1\', \'c1\', \'lunch-shift\', 6, \'[1,2,3,4,5]\', \'{"2":{"code":"x"},"5":{"code":"y"}}\', \'{"2":4,"5":2}\')',
    ).run();
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage, passed_stages) " +
        "VALUES ('p2', 'u1', 'c1', 'cpu', 5, '[1,2,3,4]')",
    ).run();
    for (const stage of [4, 5]) {
      db.prepare(
        "INSERT INTO submissions (id, project_id, user_id, lab_id, stage_index, snapshot_graph, score, total, passed, test_summary) " +
          `VALUES ('s${stage}', 'p1', 'u1', 'lunch-shift', ${stage}, '{}', 1, 1, 1, '{}')`,
      ).run();
    }

    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    const row = db
      .prepare(
        "SELECT passed_stages, current_stage, draft_graph, draft_revisions FROM student_projects WHERE id='p1'",
      )
      .get() as {
      passed_stages: string;
      current_stage: number;
      draft_graph: string;
      draft_revisions: string;
    };
    expect(row.passed_stages).toBe("[1,2,3,4]");
    // nextLunchStage semantics: stage 5 is the first unpassed stage again.
    expect(row.current_stage).toBe(5);
    expect(row.draft_graph).toBe('{"2":{"code":"x"}}');
    expect(row.draft_revisions).toBe('{"2":4}');
    // Stage-5 submissions dropped; the stage-4 record stays.
    const stages = db
      .prepare(
        "SELECT stage_index FROM submissions WHERE lab_id='lunch-shift' ORDER BY stage_index",
      )
      .all() as { stage_index: number }[];
    expect(stages.map((s) => s.stage_index)).toEqual([4]);
    // Other labs are untouched.
    expect(
      (
        db.prepare("SELECT passed_stages FROM student_projects WHERE id='p2'").get() as {
          passed_stages: string;
        }
      ).passed_stages,
    ).toBe("[1,2,3,4]");
    db.close();
  });

  it("migrates a real v3 database whose rows survive the chain", () => {
    const db = fixtureDb(3);
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES ('c1', 'class', 'inv')").run();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES ('u1', 'no1', 'n', 'h', 'teacher')",
    ).run();
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id) VALUES ('p1', 'u1', 'c1', 'calculator')",
    ).run();

    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    expect(tableExists(db, "task_sheets")).toBe(true);
    expect(tableExists(db, "cpu_guided_first_answers")).toBe(true);
    expect(
      (
        db.prepare("SELECT passed_stages FROM student_projects WHERE id = 'p1'").get() as {
          passed_stages: string;
        }
      ).passed_stages,
    ).toBe("[]");
    db.close();
  });

  it("leaves a current database untouched", () => {
    const db = fixtureDb(SCHEMA_VERSION);
    migrate(db);
    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    db.close();
  });

  it("completes a database half-migrated by an older build", () => {
    // Simulate the pre-transactional failure mode: passed_stages was added but
    // the process died before stamping the version, so the next migrate must
    // skip the applied ALTER instead of dying on a duplicate column.
    const db = fixtureDb(1);
    db.exec("ALTER TABLE student_projects ADD COLUMN passed_stages TEXT NOT NULL DEFAULT '[]'");
    db.exec("PRAGMA user_version = 1");

    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    expect(tableExists(db, "task_sheets")).toBe(true);
    db.close();
  });

  it("rolls back the whole chain when a step fails", () => {
    // student_projects missing makes the v2 ALTER fail mid-chain; the version
    // stamp and every later step must roll back together.
    const db = fixtureDb(1);
    db.exec("DROP TABLE student_projects");
    try {
      expect(() => migrate(db)).toThrow();
      expect(versionOf(db)).toBe(1);
      expect(
        () => db.prepare("SELECT role FROM users LIMIT 0"),
        "v3 step should have rolled back",
      ).toThrow();
      expect(tableExists(db, "task_sheets"), "v4 step should have rolled back").toBe(false);
    } finally {
      db.close();
    }
  });
});
