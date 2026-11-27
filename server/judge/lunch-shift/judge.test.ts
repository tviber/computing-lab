import { describe, expect, it } from "vitest";
import { openMemoryDb, newId } from "../../db/client.ts";
import { getOrCreateProject } from "../pipeline.ts";
import { judgeLunchShiftSubmission } from "./judge.ts";
import {
  priorityIndex,
  PRIORITY_TABLE_SIZE,
} from "../../../src/features/lunch-shift/domain/priority.ts";
import {
  COMPENSATE_TABLE_SIZE,
  compensateIndex,
} from "../../../src/features/lunch-shift/domain/compensate.ts";
import { INTAKE_SCENARIO } from "../../../src/features/lunch-shift/domain/scenarios.ts";
import { FINAL_PUBLIC_ORDERS, FINAL_SCENARIO } from "./hiddenSet.ts";

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

const BOOST10 = tableFor((u, w) => (u ? 1 : 0) + (w >= 10 ? 1 : 0));

describe("lunch-shift judge", () => {
  /** AI-intake rows over the practice set: `wrong` rows model an AI miss
   *  the function didn't flag; `confirmIds` get confirmed. */
  function practiceResults(wrongIds: string[] = [], confirmIds: string[] = []) {
    return INTAKE_SCENARIO.orders.map((order) => ({
      id: order.id,
      ticket: wrongIds.includes(order.id)
        ? { ...order.expected!, item: order.expected!.item === "鸡腿饭" ? "蛋炒饭" : "鸡腿饭" }
        : { ...order.expected! },
      confirmed: confirmIds.includes(order.id),
    }));
  }
  const intakeDraft = (results: unknown) => ({ confirmCode: "x", results });

  it("stage 2 passes only when the confirmed misses cover every AI error", () => {
    const { db, project } = setupProject([1]);
    // AI missed P06 and P10; the function confirmed only P10 — P06 fails.
    const partial = judgeLunchShiftSubmission(
      db,
      project,
      2,
      intakeDraft(practiceResults(["P06", "P10"], ["P10"])),
    );
    expect("error" in partial).toBe(false);
    if ("error" in partial) return;
    expect(partial.passed).toBe(false);
    expect(partial.score).toBe(11);
    if (partial.testSummary.kind !== "ai-intake") return;
    expect(partial.testSummary.correct).toBe(11);
    expect(partial.testSummary.confirmed).toBe(1);

    // Confirming both misses (plus two borderline-but-right ones) passes.
    const good = judgeLunchShiftSubmission(
      db,
      project,
      2,
      intakeDraft(practiceResults(["P06", "P10"], ["P06", "P10", "P03", "P05"])),
    );
    expect("error" in good).toBe(false);
    if ("error" in good) return;
    expect(good.passed).toBe(true);
    expect(good.passedStages).toEqual([1, 2]);
    // Stage 4 stays locked — no order wording leaks with the result.
    expect(good.aiOrders).toBeNull();
    if (good.testSummary.kind !== "ai-intake") return;
    expect(good.testSummary.correct).toBe(12);
    expect(good.testSummary.confirmed).toBe(4);
    const p06 = good.testSummary.orders?.find((order) => order.id === "P06");
    expect(p06?.correct).toBe(true);
    expect(p06?.rescued).toBe(true);
    const p03 = good.testSummary.orders?.find((order) => order.id === "P03");
    expect(p03?.correct).toBe(true);
    expect(p03?.rescued).toBe(false);
  });

  it("stage 2 fails when a stray confirmation leaves the real miss wrong", () => {
    const { db, project } = setupProject([1]);
    // The reviewer's case: confirming an already-right order does NOT
    // fix the miss — 11/12 stays 11/12 and cannot pass.
    const outcome = judgeLunchShiftSubmission(
      db,
      project,
      2,
      intakeDraft(practiceResults(["P10"], ["P05"])),
    );
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(false);
    if (outcome.testSummary.kind !== "ai-intake") return;
    expect(outcome.testSummary.correct).toBe(11);
    expect(outcome.testSummary.confirmed).toBe(1);
  });

  it("stage 2 fails over the confirmation budget even when all tickets land right", () => {
    const { db, project } = setupProject([1]);
    const outcome = judgeLunchShiftSubmission(
      db,
      project,
      2,
      intakeDraft(practiceResults([], ["P01", "P02", "P03", "P04", "P05"])),
    );
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(false);
    if (outcome.testSummary.kind !== "ai-intake") return;
    expect(outcome.testSummary.correct).toBe(12);
    expect(outcome.testSummary.confirmed).toBe(5);
  });

  it("stage 2 refuses missing results without recording a submission", () => {
    const { db, project } = setupProject([1]);
    const outcome = judgeLunchShiftSubmission(db, project, 2, intakeDraft(null));
    expect("error" in outcome).toBe(true);
    if (!("error" in outcome)) return;
    expect(outcome.error).toBe("missing-run");
    const rows = db
      .prepare("SELECT COUNT(*) AS n FROM submissions WHERE lab_id='lunch-shift' AND stage_index=2")
      .get() as { n: number };
    expect(rows.n).toBe(0);
  });

  it("stage 3 grades the probes — naive single-axis tables cannot pass", () => {
    const { db, project } = setupProject([1, 2]);
    const fifo = judgeLunchShiftSubmission(db, project, 3, {
      code: "x",
      priority: new Array(PRIORITY_TABLE_SIZE).fill(0),
    });
    expect("error" in fifo).toBe(false);
    if ("error" in fifo) return;
    expect(fifo.passed).toBe(false);
    // FIFO answers the 9 wait probes but loses all 3 urgent ones.
    expect(fifo.score).toBe(9);

    const urgentFirst = judgeLunchShiftSubmission(db, project, 3, {
      code: "x",
      priority: tableFor((u) => (u ? 1 : 0)),
    });
    expect("error" in urgentFirst).toBe(false);
    if ("error" in urgentFirst) return;
    expect(urgentFirst.passed).toBe(false);
    // Urgent-first earns only the 加急要快 layer — the old 11/12 pass is gone.
    expect(urgentFirst.score).toBe(3);

    const balanced = judgeLunchShiftSubmission(db, project, 3, {
      code: "x",
      priority: tableFor((u, w) => (u ? 1 : 0) + (w >= 10 ? 1 : 0)),
    });
    expect("error" in balanced).toBe(false);
    if ("error" in balanced) return;
    expect(balanced.passed).toBe(true);
    expect(balanced.score).toBe(12);
    // Stage 3's pass unlocks stage 4 — the order wording rides along so
    // the page needs no reload (ids + request text only).
    expect(balanced.aiOrders).toEqual(FINAL_PUBLIC_ORDERS);
  });

  /** AI-intake draft builder: `expected` rows mirror a perfect AI guess,
   *  `wrong` rows a miss the model didn't flag; `confirmIds` get confirmed. */
  function aiResults(wrongIds: string[] = [], confirmIds: string[] = []) {
    return FINAL_SCENARIO.orders.map((order) => ({
      id: order.id,
      ticket: wrongIds.includes(order.id)
        ? { ...order.expected!, item: order.expected!.item === "鸡腿饭" ? "蛋炒饭" : "鸡腿饭" }
        : { ...order.expected! },
      confirmed: confirmIds.includes(order.id),
    }));
  }
  const aiDraft = (results: unknown, priority: unknown = BOOST10) => ({
    confirmCode: "x",
    results,
    queueCode: "y",
    priority,
  });

  it("the public AI orders carry ids and wording only — no answers", () => {
    expect(FINAL_PUBLIC_ORDERS).toHaveLength(FINAL_SCENARIO.orders.length);
    for (const order of FINAL_PUBLIC_ORDERS) {
      expect(Object.keys(order).sort()).toEqual(["id", "request"]);
    }
    const serialized = JSON.stringify(FINAL_PUBLIC_ORDERS);
    for (const order of FINAL_SCENARIO.orders) {
      expect(serialized).not.toContain(JSON.stringify(order.expected));
      expect(serialized).not.toContain(`"cookTicks":${order.cookTicks}`);
      expect(serialized).not.toContain(`"arrivalTick":${order.arrivalTick}`);
    }
  });

  it("stage 4 requires stage 3 passed", () => {
    const { db, project } = setupProject([1]);
    const outcome = judgeLunchShiftSubmission(db, project, 4, aiDraft(aiResults()));
    expect("error" in outcome).toBe(true);
    if (!("error" in outcome)) return;
    expect(outcome.error).toBe("stage-locked");
  });

  it("stage 4 refuses missing artefacts without recording a submission", () => {
    const { db, project } = setupProject([1, 2, 3]);
    const outcome = judgeLunchShiftSubmission(db, project, 4, {
      confirmCode: "x",
      results: null,
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

  it("stage 4 fails when never-confirm keeps an AI miss — 12/12 required", () => {
    const { db, project } = setupProject([1, 2, 3]);
    const outcome = judgeLunchShiftSubmission(db, project, 4, aiDraft(aiResults(["F11"], [])));
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(false);
    if (outcome.testSummary.kind !== "final") return;
    expect(outcome.testSummary.correct).toBe(11);
    expect(outcome.testSummary.confirmed).toBe(0);
  });

  it("stage 4 fails when a stray confirmation leaves the real miss wrong", () => {
    const { db, project } = setupProject([1, 2, 3]);
    // AI missed F11; confirming an already-right F05 keeps 11/12 — a
    // pass must find the orders the model actually missed.
    const outcome = judgeLunchShiftSubmission(db, project, 4, aiDraft(aiResults(["F11"], ["F05"])));
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(false);
    if (outcome.testSummary.kind !== "final") return;
    expect(outcome.testSummary.correct).toBe(11);
    expect(outcome.testSummary.confirmed).toBe(1);
  });

  it("stage 4 fails when always-confirm burns the whole budget", () => {
    const { db, project } = setupProject([1, 2, 3]);
    const allIds = FINAL_SCENARIO.orders.map((order) => order.id);
    const outcome = judgeLunchShiftSubmission(db, project, 4, aiDraft(aiResults([], allIds)));
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(false);
    if (outcome.testSummary.kind !== "final") return;
    expect(outcome.testSummary.confirmed).toBe(12);
    // Every confirmed order still records correctly — the budget fails it.
    expect(outcome.testSummary.correct).toBe(12);
  });

  it("stage 4 fails when over-confirming starves the kitchen — served is a pass line", () => {
    const { db, project } = setupProject([1, 2, 3]);
    // All tickets right, four confirmations inside the budget — but this
    // pick stalls the wrong orders: served drops to 10 < 11.
    const draft = aiDraft(aiResults([], ["F01", "F05", "F07", "F11"]));
    const outcome = judgeLunchShiftSubmission(db, project, 4, draft);
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(false);
    if (outcome.testSummary.kind !== "final") return;
    expect(outcome.testSummary.correct).toBe(12);
    expect(outcome.testSummary.confirmed).toBe(4);
    expect(outcome.testSummary.served).toBe(10);
  });

  it("stage 4 fails when the queue cannot absorb the stalls — priority matters", () => {
    const { db, project } = setupProject([1, 2, 3]);
    // Right tickets and a honest 2-confirm pick, but a FIFO queue lets
    // everything run late — a weak stage-3 function cannot pass stage 4.
    const draft = aiDraft(aiResults([], ["F10", "F11"]), new Array(PRIORITY_TABLE_SIZE).fill(0));
    const outcome = judgeLunchShiftSubmission(db, project, 4, draft);
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(false);
    if (outcome.testSummary.kind !== "final") return;
    expect(outcome.testSummary.correct).toBe(12);
    expect(outcome.testSummary.served).toBe(8);
  });

  it("stage 4 passes when confirm catches the misses inside budget and service", () => {
    const { db, project } = setupProject([1, 2, 3]);
    // AI missed F11 and flagged it plus three borderline-but-right ones.
    const draft = aiDraft(aiResults(["F11"], ["F11", "F01", "F03", "F08"]));
    const outcome = judgeLunchShiftSubmission(db, project, 4, draft);
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(true);
    expect(outcome.passedStages).toEqual([1, 2, 3, 4]);
    if (outcome.testSummary.kind !== "final") return;
    expect(outcome.testSummary.correct).toBe(12);
    expect(outcome.testSummary.confirmed).toBe(4);
    expect(outcome.testSummary.served).toBe(12);
    const f11 = outcome.testSummary.orders?.find((order) => order.id === "F11");
    expect(f11?.correct).toBe(true);
    expect(f11?.confirmed).toBe(true);
    expect(f11?.rescued).toBe(true);
    expect(outcome.testSummary.run?.orders).toHaveLength(12);
    const replayRow = outcome.testSummary.run?.orders[0];
    expect(replayRow).not.toHaveProperty("request");
    expect(replayRow).not.toHaveProperty("expected");
    const rows = db
      .prepare(
        "SELECT COUNT(*) AS n FROM submissions WHERE lab_id='lunch-shift' AND stage_index=4 AND passed=1",
      )
      .get() as { n: number };
    expect(rows.n).toBe(1);

    const serialized = JSON.stringify(outcome.testSummary);
    expect(serialized).not.toContain("别放香菜");
    expect(serialized).not.toContain("加钱走急单");
    expect(serialized).not.toContain("request");
  });

  it("stage 4 lets a student retry and resubmit after passing", () => {
    const { db, project } = setupProject([1, 2, 3]);
    const failed = judgeLunchShiftSubmission(db, project, 4, aiDraft(aiResults(["F11"], [])));
    expect("error" in failed).toBe(false);
    if ("error" in failed) return;
    // The unflagged AI miss keeps correct at 11 — one short of the line.
    expect(failed.passed).toBe(false);

    const again = judgeLunchShiftSubmission(db, { ...project, passedStages: [1, 2, 3, 4] }, 4, {
      confirmCode: "x",
      results: aiResults(["F11"], ["F11"]),
      queueCode: "y",
      priority: BOOST10,
    });
    expect("error" in again).toBe(false);
    if ("error" in again) return;
    expect(again.passed).toBe(true);
    expect(again.passedStages).toEqual([1, 2, 3, 4]);
  });

  const compensateTableFor = (
    fn: (urgent: boolean, overtime: number, delivered: boolean, price: number) => number,
  ): number[] => {
    const table = new Array(COMPENSATE_TABLE_SIZE).fill(0);
    for (const u of [false, true])
      for (let o = 0; o <= 30; o++)
        for (const d of [false, true])
          for (let p = 0; p <= 30; p++) table[compensateIndex(u, o, d, p)] = fn(u, o, d, p);
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
      compensate: new Array(124).fill(0), // the old 124-cell shape
    });
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(false);
    expect(outcome.testSummary.kind).toBe("compensate");
    if (outcome.testSummary.kind !== "compensate") return;
    expect(outcome.testSummary.errors?.[0]).toContain("3844");
  });

  it("stage 5 needs both lines held: reviews AND spend", () => {
    const { db, project } = setupProject([1, 2, 3]);
    // Refund every undelivered order and snack the rest: reviews 3.28 but
    // full-price refunds on all six lost orders run 110 元.
    const blind = judgeLunchShiftSubmission(db, project, 5, {
      code: "x",
      compensate: compensateTableFor((_u, _o, d) => (d ? 1 : 2)),
    });
    expect("error" in blind).toBe(false);
    if ("error" in blind) return;
    expect(blind.passed).toBe(false);
    if (blind.testSummary.kind !== "compensate") return;
    expect(blind.testSummary.spend).toBe(110);

    // The optimum: refund cheap (≤12) undelivered + urgent delivered late
    // ≥4 ticks, snack the rest — 3.79 reviews @ exactly 70 元.
    const aware = judgeLunchShiftSubmission(db, project, 5, {
      code: "x",
      compensate: compensateTableFor((u, o, d, p) =>
        (!d && p <= 12) || (d && u && o >= 4) ? 2 : 1,
      ),
    });
    expect("error" in aware).toBe(false);
    if ("error" in aware) return;
    expect(aware.passed).toBe(true);
    expect(aware.score).toBe(1);
    expect(aware.passedStages).toEqual([1, 2, 3, 5]);
    if (aware.testSummary.kind !== "compensate") return;
    expect(aware.testSummary.badReviewPoints).toBe(379);
    expect(aware.testSummary.spend).toBe(70);
    expect(aware.testSummary.bestReviewPoints).toBe(379);
    expect(aware.testSummary.bestSpend).toBe(70);
  });
});
