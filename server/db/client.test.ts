import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BUSY_TIMEOUT_MS,
  findPackageRoot,
  migrate,
  MIN_SUPPORTED_SCHEMA_VERSION,
  openDb,
  openMemoryDb,
  resolveDbPath,
  SCHEMA_VERSION,
} from "./client.ts";

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
  if (version < 22) db.exec("DROP TABLE calculator_full_adder_guide_acknowledgements");
  if (version < 18) db.exec("ALTER TABLE student_projects DROP COLUMN project_generation");
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

const supportedStartVersions = Array.from(
  { length: SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION + 1 },
  (_, index) => MIN_SUPPORTED_SCHEMA_VERSION + index,
);

describe("migrate", () => {
  it.each(supportedStartVersions)("upgrades a v%i database to the current schema", (version) => {
    const db = fixtureDb(version);
    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    for (const table of [
      "task_sheets",
      "task_assignments",
      "task_responses",
      "cpu_guided_first_answers",
      "calculator_full_adder_guide_acknowledgements",
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
  });

  it("creates the full schema from an empty database", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    expect(tableExists(db, "task_responses")).toBe(true);
    expect(tableExists(db, "calculator_full_adder_guide_acknowledgements")).toBe(true);
    db.close();
  });

  it("refuses a database newer than this build without rewriting its version", () => {
    const db = fixtureDb(SCHEMA_VERSION);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);

    try {
      expect(() => migrate(db)).toThrow(/newer than this build/);
      expect(versionOf(db)).toBe(SCHEMA_VERSION + 1);
    } finally {
      db.close();
    }
  });

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
    // v13 drops stage 5; v15 then drops stages 2 and 4 (both redesigned
    // around AI intake); v16 drops stage 3 (regraded by the probe
    // battery) — only stage 1 survives.
    expect(row.passed_stages).toBe("[1]");
    // nextLunchStage semantics: stage 2 is the first unpassed stage again.
    expect(row.current_stage).toBe(2);
    expect(row.draft_graph).toBe("{}");
    expect(row.draft_revisions).toBe("{}");
    // Stage-5 submissions dropped by v13; stage-4 dropped by v15.
    const stages = db
      .prepare(
        "SELECT stage_index FROM submissions WHERE lab_id='lunch-shift' ORDER BY stage_index",
      )
      .all() as { stage_index: number }[];
    expect(stages.map((s) => s.stage_index)).toEqual([]);
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

  it("drops lunch-shift stage-2/4 leftovers but keeps 1/3/5 (v14 -> v15)", () => {
    // Stages 2 and 4 were redesigned around AI intake: their submissions
    // and drafts are stale, but the training walkthrough, the queue
    // function and the bonus challenge carry over unchanged.
    const db = fixtureDb(14);
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES ('c1', 'class', 'inv')").run();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES ('u1', 'no1', 'n', 'h', 'user')",
    ).run();
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage, passed_stages, draft_graph, draft_revisions) " +
        'VALUES (\'p1\', \'u1\', \'c1\', \'lunch-shift\', 6, \'[1,2,3,4,5]\', \'{"2":{"confirmCode":"a"},"3":{"code":"b"},"4":{"confirmCode":"c"}}\', \'{"2":1,"3":7,"4":2}\')',
    ).run();
    for (const stage of [2, 3, 4, 5]) {
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
    // v15 keeps stage 3, but v16 (the probe battery rescoring) drops it
    // as well — 1 and 5 survive the whole chain.
    expect(row.passed_stages).toBe("[1,5]");
    // Stage 2 reopens as the first unpassed stage.
    expect(row.current_stage).toBe(2);
    expect(row.draft_graph).toBe("{}");
    expect(row.draft_revisions).toBe("{}");
    const stages = db
      .prepare(
        "SELECT stage_index FROM submissions WHERE lab_id='lunch-shift' ORDER BY stage_index",
      )
      .all() as { stage_index: number }[];
    expect(stages.map((s) => s.stage_index)).toEqual([5]);
    db.close();
  });

  it("drops lunch-shift stage-3 leftovers when the probe battery rescoring lands (v15 -> v16)", () => {
    // Stage 3 moved from one 12-order simulated round to 12 layered
    // probes; a naive urgent-first table that scored 11 before scores 3
    // now, so old passes and drafts are stale.
    const db = fixtureDb(15);
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES ('c1', 'class', 'inv')").run();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES ('u1', 'no1', 'n', 'h', 'user')",
    ).run();
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage, passed_stages, draft_graph, draft_revisions) " +
        'VALUES (\'p1\', \'u1\', \'c1\', \'lunch-shift\', 4, \'[1,2,3]\', \'{"3":{"code":"q"},"4":{"confirmCode":"c"}}\', \'{"3":9,"4":3}\')',
    ).run();
    db.prepare(
      "INSERT INTO submissions (id, project_id, user_id, lab_id, stage_index, snapshot_graph, score, total, passed, test_summary) " +
        "VALUES ('s3', 'p1', 'u1', 'lunch-shift', 3, '{}', 11, 12, 1, '{}')",
    ).run();
    db.prepare(
      "INSERT INTO submissions (id, project_id, user_id, lab_id, stage_index, snapshot_graph, score, total, passed, test_summary) " +
        "VALUES ('s2', 'p1', 'u1', 'lunch-shift', 2, '{}', 12, 12, 1, '{}')",
    ).run();

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
    expect(row.passed_stages).toBe("[1,2]");
    expect(row.current_stage).toBe(3);
    // The stage-3 queue draft is dropped; the stage-4 AI draft survives.
    expect(row.draft_graph).toBe('{"4":{"confirmCode":"c"}}');
    expect(row.draft_revisions).toBe('{"4":3}');
    const stages = db
      .prepare(
        "SELECT stage_index FROM submissions WHERE lab_id='lunch-shift' ORDER BY stage_index",
      )
      .all() as { stage_index: number }[];
    expect(stages.map((s) => s.stage_index)).toEqual([2]);
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

  it("shifts legacy logistic regression progress, drafts, revisions, and submissions forward from v16", () => {
    const db = fixtureDb(16);
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES ('c1', 'class', 'inv')").run();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES ('u1', 'no1', 'n', 'h', 'user')",
    ).run();
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage, passed_stages, draft_graph, draft_revisions) " +
        "VALUES ('p1', 'u1', 'c1', 'ml-intro', 3, '[1,2]', '{\"1\":{\"customText\":\"hi\"},\"2\":{\"bias\":-1}}', '{\"1\":4,\"2\":2}')",
    ).run();
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage, passed_stages) " +
        "VALUES ('p2', 'u1', 'c1', 'calculator', 3, '[1,2]')",
    ).run();
    for (const stage of [1, 2]) {
      db.prepare(
        "INSERT INTO submissions (id, project_id, user_id, lab_id, stage_index, snapshot_graph, score, total, passed, test_summary) " +
          `VALUES ('logistic-regression-${stage}', 'p1', 'u1', 'ml-intro', ${stage}, '{}', 1, 1, 1, '{}')`,
      ).run();
    }

    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    const logisticRegressionRow = db
      .prepare(
        "SELECT passed_stages, current_stage, draft_graph, draft_revisions FROM student_projects WHERE id='p1'",
      )
      .get() as {
      passed_stages: string;
      current_stage: number;
      draft_graph: string;
      draft_revisions: string;
    };
    expect(logisticRegressionRow.passed_stages).toBe("[2,3]");
    expect(logisticRegressionRow.current_stage).toBe(1);
    expect(JSON.parse(logisticRegressionRow.draft_graph)).toEqual({
      "2": { customText: "hi" },
      "3": { bias: -1 },
    });
    expect(JSON.parse(logisticRegressionRow.draft_revisions)).toEqual({ "2": 4, "3": 2 });
    const logisticRegressionSubs = db
      .prepare(
        "SELECT stage_index FROM submissions WHERE lab_id='logistic-regression' ORDER BY stage_index",
      )
      .all() as { stage_index: number }[];
    expect(logisticRegressionSubs.map((s) => s.stage_index)).toEqual([2, 3]);
    expect(
      (
        db.prepare("SELECT passed_stages FROM student_projects WHERE id='p2'").get() as {
          passed_stages: string;
        }
      ).passed_stages,
    ).toBe("[1,2]");
    expect(
      (
        db.prepare("SELECT project_generation FROM student_projects WHERE id='p2'").get() as {
          project_generation: number;
        }
      ).project_generation,
    ).toBe(0);
    db.close();
  });

  it("backfills project_generation = 0 when a v17 database upgrades to v18", () => {
    const db = fixtureDb(17);
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES ('c1', 'class', 'inv')").run();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES ('u1', 'no1', 'n', 'h', 'teacher')",
    ).run();
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage, passed_stages) " +
        "VALUES ('p1', 'u1', 'c1', 'calculator', 3, '[1,2]')",
    ).run();

    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    const row = db
      .prepare("SELECT project_generation FROM student_projects WHERE id = 'p1'")
      .get() as { project_generation: number };
    expect(row.project_generation).toBe(0);
    db.close();
  });

  it("retires old evaluations and removes their SMS text while preserving training and graduation", () => {
    const db = fixtureDb(18);
    db.exec(`
      INSERT INTO classes (id, name, invite_code) VALUES ('c1', 'class', 'inv');
      INSERT INTO users (id, student_no, name, password_hash, role)
      VALUES ('u1', 'no1', 'n', 'h', 'user'), ('u2', 'no2', 'n', 'h', 'user');
      INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage,
        passed_stages, draft_graph, draft_revisions, project_generation)
      VALUES ('finished', 'u1', 'c1', 'ml-intro', 7, '[1,2,3,4,5,6]',
        '{"4":{"eta":0.25},"5":{"threshold":0.4},"6":{"probeText":"示例短信"}}',
        '{"4":2,"5":3,"6":4}', 3),
        ('evaluated', 'u2', 'c1', 'ml-intro', 6, '[1,2,3,4,5]', '{}', '{}', 0);
      INSERT INTO submissions (id, project_id, user_id, lab_id, stage_index,
        snapshot_graph, score, total, passed, test_summary)
      VALUES ('matrix', 'finished', 'u1', 'ml-intro', 5, '{}', 1, 1, 1, '{}'),
        ('final', 'finished', 'u1', 'ml-intro', 6, '{"probeText":"示例短信","eta":0.25}', 1, 1, 1, '{}'),
        ('retry', 'evaluated', 'u2', 'ml-intro', 6, '{"probeText":"另一条短信"}', 0, 1, 0, '{}');
    `);

    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    expect(db.prepare("SELECT * FROM student_projects WHERE id = 'finished'").get()).toMatchObject({
      lab_id: "logistic-regression",
      current_stage: 6,
      passed_stages: "[1,2,3,4,5]",
      draft_graph: JSON.stringify({
        4: { eta: 0.25 },
      }),
      draft_revisions: '{"4":2}',
      project_generation: 4,
    });
    expect(db.prepare("SELECT * FROM student_projects WHERE id = 'evaluated'").get()).toMatchObject(
      {
        current_stage: 5,
        passed_stages: "[1,2,3,4]",
        project_generation: 1,
      },
    );
    expect(
      db.prepare("SELECT id, stage_index, snapshot_graph FROM submissions ORDER BY id").all(),
    ).toEqual([
      { id: "final", stage_index: 5, snapshot_graph: '{"eta":0.25}' },
      { id: "matrix", stage_index: 7, snapshot_graph: "{}" },
      { id: "retry", stage_index: 6, snapshot_graph: "{}" },
    ]);
    db.close();
  });

  it("renames the logistic regression lab from v19 without changing progress or access", () => {
    const db = fixtureDb(19);
    db.exec(`
      INSERT INTO classes (id, name, invite_code) VALUES ('c1', 'class', 'inv');
      INSERT INTO users (id, student_no, name, password_hash, role)
      VALUES ('u1', 'no1', 'n', 'h', 'user');
      INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage,
        passed_stages, draft_graph, draft_revisions, project_generation)
      VALUES ('p1', 'u1', 'c1', 'ml-intro', 6, '[1,2,3,4,5]',
        '{"5":{"activity":"sms-classification"}}', '{"5":2}', 4);
      INSERT INTO submissions (id, project_id, user_id, lab_id, stage_index,
        snapshot_graph, score, total, passed, test_summary)
      VALUES ('s1', 'p1', 'u1', 'ml-intro', 5, '{}', 1, 1, 1, '{}');
      INSERT INTO lab_settings (lab_id, hidden, open_class_ids)
      VALUES ('ml-intro', 1, '["c1"]'), ('calculator', 0, NULL);
      INSERT INTO lab_class_settings (lab_id, class_id, open) VALUES ('ml-intro', 'c1', 0);
    `);

    migrate(db);
    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    expect(db.prepare("SELECT * FROM student_projects").all()).toMatchObject([
      {
        id: "p1",
        lab_id: "logistic-regression",
        current_stage: 6,
        passed_stages: "[1,2,3,4,5]",
        draft_graph: "{}",
        draft_revisions: "{}",
        project_generation: 4,
      },
    ]);
    expect(db.prepare("SELECT * FROM submissions").all()).toMatchObject([
      { id: "s1", lab_id: "logistic-regression", project_id: "p1", stage_index: 5, passed: 1 },
    ]);
    expect(db.prepare("SELECT * FROM lab_settings ORDER BY lab_id").all()).toMatchObject([
      { lab_id: "calculator", hidden: 0, open_class_ids: null },
      { lab_id: "logistic-regression", hidden: 1, open_class_ids: '["c1"]' },
    ]);
    expect(db.prepare("SELECT * FROM lab_class_settings").all()).toMatchObject([
      { lab_id: "logistic-regression", class_id: "c1", open: 0 },
    ]);
    db.close();
  });

  it("removes saved experience drafts from an already renamed v20 project", () => {
    const db = fixtureDb(20);
    db.exec(`
      INSERT INTO users (id, student_no, name, password_hash) VALUES ('u1', 'no1', 'n', 'h');
      INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage,
        passed_stages, draft_graph, draft_revisions)
      VALUES ('p1', 'u1', 'c1', 'logistic-regression', 6, '[1,2,3,4,5]',
        '{"4":{"eta":0.1},"5":{"probeText":"旧短信"}}', '{"4":1,"5":2}');
    `);
    migrate(db);
    expect(db.prepare("SELECT * FROM student_projects").get()).toMatchObject({
      current_stage: 6,
      passed_stages: "[1,2,3,4,5]",
      draft_graph: '{"4":{"eta":0.1}}',
      draft_revisions: '{"4":1}',
    });
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

describe("database path", () => {
  it("anchors the default database at the nearest package root", () => {
    const root = mkdtempSync(join(tmpdir(), "computing-lab-db-"));
    try {
      const sourceDir = join(root, "server", "db");
      const serverDir = join(root, "dist-server");
      mkdirSync(sourceDir, { recursive: true });
      mkdirSync(serverDir);
      writeFileSync(join(root, "package.json"), "{}\n");

      expect(findPackageRoot(sourceDir)).toBe(root);
      expect(findPackageRoot(serverDir)).toBe(root);
      expect(resolveDbPath(sourceDir)).toBe(join(root, "data", "lab.db"));
      expect(resolveDbPath(serverDir)).toBe(join(root, "data", "lab.db"));
      expect(resolveDbPath(serverDir, "./custom.db")).toBe(resolve("custom.db"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("connection pragmas", () => {
  it("sets PRAGMA busy_timeout to 5000 on both file and in-memory databases", () => {
    const dir = mkdtempSync(join(tmpdir(), "computing-lab-pragma-"));
    const fileDb = openDb(join(dir, "lab.db"));
    const memoryDb = openMemoryDb();
    try {
      expect(fileDb.prepare("PRAGMA busy_timeout").get()).toEqual({
        timeout: DEFAULT_BUSY_TIMEOUT_MS,
      });
      expect(memoryDb.prepare("PRAGMA busy_timeout").get()).toEqual({
        timeout: DEFAULT_BUSY_TIMEOUT_MS,
      });
    } finally {
      fileDb.close();
      memoryDb.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
