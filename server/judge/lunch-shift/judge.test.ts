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
import {
  COMPENSATE_TABLE_SIZE,
  compensateIndex,
} from "../../../src/features/lunch-shift/domain/compensate.ts";

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
  rush: [...defaultIntakeTables().rush, "快", "等不及"],
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

  it("stage 4 records a fail below 18 and lets the student retry to a pass", () => {
    const { db, project } = setupProject([1, 2, 3]);
    // Word tables that only catch the practice wording don't generalize:
    // 8 correct + 8 记对且准时 = 16, under the 18 line.
    const literal: IntakeTables = {
      dish: [...defaultIntakeTables().dish, ["炒饭", "蛋炒饭"]],
      note: [...defaultIntakeTables().note, ["不放香菜", "不要香菜"], ["别太辣", "少辣"]],
      calm: [...defaultIntakeTables().calm, "不用赶"],
      rush: [...defaultIntakeTables().rush, "能快点吗"],
    };
    const failed = judgeLunchShiftSubmission(db, project, 4, {
      intakeCode: "x",
      tables: literal,
      queueCode: "y",
      priority: BOOST10,
    });
    expect("error" in failed).toBe(false);
    if ("error" in failed) return;
    expect(failed.passed).toBe(false);
    expect(failed.score).toBe(16);
    expect(failed.passedStages).toEqual([1, 2, 3]);
    const fails = db
      .prepare(
        "SELECT COUNT(*) AS n FROM submissions WHERE lab_id='lunch-shift' AND stage_index=4 AND passed=0",
      )
      .get() as { n: number };
    expect(fails.n).toBe(1);

    // A failed attempt never locks the stage — the retry grades normally.
    const draft = {
      intakeCode: "x",
      tables: GENERIC_TABLES,
      queueCode: "y",
      priority: BOOST10,
    };
    const retried = judgeLunchShiftSubmission(db, project, 4, draft);
    expect("error" in retried).toBe(false);
    if ("error" in retried) return;
    expect(retried.passed).toBe(true);
    expect(retried.score).toBe(24);
    expect(retried.total).toBe(24);
    expect(retried.passedStages).toEqual([1, 2, 3, 4]);

    // Passing doesn't lock the stage either — a better score can be chased
    // the same way stages 2/3 stay resubmittable.
    const again = judgeLunchShiftSubmission(db, { ...project, passedStages: [1, 2, 3, 4] }, 4, {
      intakeCode: "x",
      tables: literal,
      queueCode: "y",
      priority: BOOST10,
    });
    expect("error" in again).toBe(false);
    if ("error" in again) return;
    expect(again.passed).toBe(false);
    expect(again.score).toBe(16);
    expect(again.passedStages).toEqual([1, 2, 3, 4]);

    const serialized = JSON.stringify(retried.testSummary);
    expect(serialized).not.toContain("别放香菜");
    expect(serialized).not.toContain("麻烦快点");
    expect(serialized).not.toContain("少放点辣");
    expect(serialized).not.toContain("request");
  });

  const compensateTableFor = (
    fn: (urgent: boolean, overtime: number, delivered: boolean) => number,
  ): number[] => {
    const table = new Array(COMPENSATE_TABLE_SIZE).fill(0);
    for (const u of [false, true])
      for (let o = 0; o <= 30; o++)
        for (const d of [false, true]) table[compensateIndex(u, o, d)] = fn(u, o, d);
    return table;
  };

  it("stage 5 requires stage 3 passed", () => {
    const { db, project } = setupProject([1, 2]);
    const outcome = judgeLunchShiftSubmission(db, project, 5, {
      code: "x",
      compensate: compensateTableFor(() => 0),
    });
    expect("error" in outcome).toBe(true);
    if (!("error" in outcome)) return;
    expect(outcome.error).toBe("stage-locked");
  });

  it("stage 5 records a failed submission on a malformed table", () => {
    const { db, project } = setupProject([1, 2, 3]);
    const outcome = judgeLunchShiftSubmission(db, project, 5, {
      code: "x",
      compensate: new Array(62).fill(0), // the old 62-cell shape
    });
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(false);
    expect(outcome.testSummary.kind).toBe("compensate");
    if (outcome.testSummary.kind !== "compensate") return;
    expect(outcome.testSummary.errors?.[0]).toContain("124");
  });

  it("stage 5 needs both lines held: reviews AND spend", () => {
    const { db, project } = setupProject([1, 2, 3]);
    // Refund every undelivered order and snack the rest: reviews 3.28 but
    // the bill runs 100 元 — over the spend line.
    const blind = judgeLunchShiftSubmission(db, project, 5, {
      code: "x",
      compensate: compensateTableFor((_u, _o, d) => (d ? 1 : 2)),
    });
    expect("error" in blind).toBe(false);
    if ("error" in blind) return;
    expect(blind.passed).toBe(false);
    if (blind.testSummary.kind !== "compensate") return;
    expect(blind.testSummary.spend).toBe(100);

    // Refund the urgent undelivered, snack the rest: 4.42 reviews @ 61 元.
    const aware = judgeLunchShiftSubmission(db, project, 5, {
      code: "x",
      compensate: compensateTableFor((u, _o, d) => (!d ? (u ? 2 : 1) : 1)),
    });
    expect("error" in aware).toBe(false);
    if ("error" in aware) return;
    expect(aware.passed).toBe(true);
    expect(aware.score).toBe(1);
    expect(aware.passedStages).toEqual([1, 2, 3, 5]);
    if (aware.testSummary.kind !== "compensate") return;
    expect(aware.testSummary.badReviewPoints).toBe(442);
    expect(aware.testSummary.spend).toBe(61);
    expect(aware.testSummary.bestReviewPoints).toBe(399);
    expect(aware.testSummary.bestSpend).toBe(74);
  });
});
