import { describe, expect, it } from "vitest";
import { openMemoryDb, newId } from "../../db/client.ts";
import { getOrCreateProject } from "../pipeline.ts";
import { judgeLunchShiftSubmission } from "./judge.ts";
import {
  defaultIntakeTables,
  type IntakeTables,
} from "../../../src/features/lunch-shift/domain/wordTables.ts";
import {
  priorityIndex,
  PRIORITY_TABLE_SIZE,
} from "../../../src/features/lunch-shift/domain/priority.ts";

const LAB_ID = "lunch-shift";

function setupProject(passedStages: number[] = []) {
  const db = openMemoryDb();
  db.prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)").run(
    newId(),
    "s1",
    "学生",
    "x",
  );
  const userId = (db.prepare("SELECT id FROM users").get() as { id: string }).id;
  const project = getOrCreateProject(db, userId, "class-1", LAB_ID);
  if (passedStages.length) {
    db.prepare("UPDATE student_projects SET passed_stages = ?, current_stage = ? WHERE id = ?").run(
      JSON.stringify(passedStages),
      Math.max(...passedStages) + 1,
      project.id,
    );
    return { db, project: { ...project, passedStages } };
  }
  return { db, project };
}

function tableFor(fn: (urgent: boolean, wait: number, cook: number) => number): number[] {
  const table = new Array(PRIORITY_TABLE_SIZE);
  for (const urgent of [false, true])
    for (let wait = 0; wait <= 30; wait++)
      for (const cook of [1, 3]) table[priorityIndex(urgent, wait, cook)] = fn(urgent, wait, cook);
  return table;
}

const GENERIC_TABLES: IntakeTables = {
  dish: [...defaultIntakeTables().dish, ["炒饭", "蛋炒饭"]],
  note: [...defaultIntakeTables().note, ["放香菜", "不要香菜"], ["辣", "少辣"]],
  calm: [...defaultIntakeTables().calm, "不用赶", "不急"],
  rush: [...defaultIntakeTables().rush, "快点", "等不及"],
};

const BOOST10 = tableFor((u, w) => (u ? 1 : 0) + (w >= 10 ? 1 : 0));

describe("lunch-shift judge", () => {
  it("stage 2 passes only at 12/12 tickets", () => {
    const { db, project } = setupProject([1]);
    const bad = judgeLunchShiftSubmission(db, project, 2, {
      code: "x",
      tables: defaultIntakeTables(),
    });
    expect("error" in bad).toBe(false);
    if ("error" in bad) return;
    expect(bad.passed).toBe(false);
    expect(bad.score).toBe(7);

    const good = judgeLunchShiftSubmission(db, project, 2, {
      code: "x",
      tables: GENERIC_TABLES,
    });
    expect("error" in good).toBe(false);
    if ("error" in good) return;
    expect(good.passed).toBe(true);
    expect(good.passedStages).toEqual([1, 2]);
  });

  it("stage 2 records a failed submission with Chinese errors on malformed tables", () => {
    const { db, project } = setupProject([1]);
    const outcome = judgeLunchShiftSubmission(db, project, 2, {
      code: "x",
      tables: { dish: "不是表", note: [], calm: [], rush: [] },
    });
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(false);
    expect(outcome.testSummary.kind).toBe("intake");
    if (outcome.testSummary.kind !== "intake") return;
    expect(outcome.testSummary.errors?.some((e) => e.includes("dish_words"))).toBe(true);
    // recorded as a submission row, not a silent rejection
    const rows = db
      .prepare("SELECT COUNT(*) AS n FROM submissions WHERE lab_id='lunch-shift' AND stage_index=2")
      .get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it("stage 3 fails below 10 on-time and passes at 10", () => {
    const { db, project } = setupProject([1, 2]);
    const fifo = judgeLunchShiftSubmission(db, project, 3, {
      code: "x",
      priority: new Array(PRIORITY_TABLE_SIZE).fill(0),
    });
    expect("error" in fifo).toBe(false);
    if ("error" in fifo) return;
    expect(fifo.passed).toBe(false);
    expect(fifo.score).toBe(8);

    const urgent = judgeLunchShiftSubmission(db, project, 3, {
      code: "x",
      priority: tableFor((u) => (u ? 1 : 0)),
    });
    expect("error" in urgent).toBe(false);
    if ("error" in urgent) return;
    expect(urgent.passed).toBe(true);
    expect(urgent.score).toBe(11);
  });

  it("stage 4 requires stage 3 passed", () => {
    const { db, project } = setupProject([1]);
    const outcome = judgeLunchShiftSubmission(db, project, 4, {
      intakeCode: "x",
      tables: GENERIC_TABLES,
      queueCode: "y",
      priority: BOOST10,
    });
    expect("error" in outcome).toBe(true);
    if (!("error" in outcome)) return;
    expect(outcome.error).toBe("stage-locked");
  });

  it("stage 4 refuses missing artefacts without recording a submission", () => {
    const { db, project } = setupProject([1, 2, 3]);
    const outcome = judgeLunchShiftSubmission(db, project, 4, {
      intakeCode: "x",
      tables: null,
      queueCode: "y",
      priority: null,
    });
    expect("error" in outcome).toBe(true);
    if (!("error" in outcome)) return;
    expect(outcome.error).toBe("missing-run");
    const rows = db
      .prepare("SELECT COUNT(*) AS n FROM submissions WHERE lab_id='lunch-shift' AND stage_index=4")
      .get() as { n: number };
    expect(rows.n).toBe(0);
  });

  it("stage 4 is one-shot and the response carries no hidden order text", () => {
    const { db, project } = setupProject([1, 2, 3]);
    const draft = {
      intakeCode: "x",
      tables: GENERIC_TABLES,
      queueCode: "y",
      priority: BOOST10,
    };
    const first = judgeLunchShiftSubmission(db, project, 4, draft);
    expect("error" in first).toBe(false);
    if ("error" in first) return;
    expect(first.passed).toBe(true);
    expect(first.score).toBe(24);
    expect(first.total).toBe(24);
    // a wrong ticket earns no 记对且准时 point either
    const literal: IntakeTables = {
      dish: [...defaultIntakeTables().dish, ["炒饭", "蛋炒饭"]],
      note: [...defaultIntakeTables().note, ["不放香菜", "不要香菜"], ["别太辣", "少辣"]],
      calm: [...defaultIntakeTables().calm, "不用赶"],
      rush: [...defaultIntakeTables().rush, "能快点吗"],
    };
    const db2 = openMemoryDb();
    db2
      .prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)")
      .run(newId(), "s2", "学生", "x");
    const user2 = (db2.prepare("SELECT id FROM users").get() as { id: string }).id;
    const project2 = getOrCreateProject(db2, user2, "class-1", LAB_ID);
    db2
      .prepare("UPDATE student_projects SET passed_stages = ?, current_stage = ? WHERE id = ?")
      .run(JSON.stringify([1, 2, 3]), 4, project2.id);
    const literalRun = judgeLunchShiftSubmission(db2, { ...project2, passedStages: [1, 2, 3] }, 4, {
      intakeCode: "x",
      tables: literal,
      queueCode: "y",
      priority: BOOST10,
    });
    expect("error" in literalRun).toBe(false);
    if (!("error" in literalRun)) {
      expect(literalRun.score).toBe(18); // 9 correct + 9 记对且准时
    }

    const serialized = JSON.stringify(first.testSummary);
    expect(serialized).not.toContain("别放香菜");
    expect(serialized).not.toContain("麻烦快点");
    expect(serialized).not.toContain("少放点辣");
    expect(serialized).not.toContain("request");

    const second = judgeLunchShiftSubmission(db, project, 4, draft);
    expect("error" in second).toBe(true);
    if (!("error" in second)) return;
    expect(second.error).toBe("final-used");
    expect(second.status).toBe(409);
  });
});
