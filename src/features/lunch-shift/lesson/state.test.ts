/**
 * Reducer checks for the cross-stage wiring: stage 4's draft seeds from
 * the stage-2/3 work, and a judge result refreshes aiOrders plus the
 * per-stage run summaries (a stage-3 pass must unlock stage 4 without a
 * page reload).
 */

import { describe, expect, it } from "vitest";
import type { LunchJudgeResult } from "../domain/protocol.ts";
import {
  createLunchLessonState,
  draftOf,
  transitionLunchLesson,
  type LunchLessonState,
} from "./state.ts";

const PRIORITY_TABLE = Array.from({ length: 124 }, () => 1);

function stateWithDrafts(overrides: Partial<LunchLessonState> = {}): LunchLessonState {
  return {
    ...createLunchLessonState(3),
    passedStages: [1, 2],
    drafts: {
      2: { confirmCode: "return similarity < 0.75", results: [] },
      3: { code: "def priority(u, w, c): return u", priority: PRIORITY_TABLE },
    },
    ...overrides,
  };
}

function outcome(partial: Partial<LunchJudgeResult>): LunchJudgeResult {
  return {
    score: 0,
    total: 0,
    passed: false,
    testSummary: { kind: "queue", onTime: 0, total: 12 },
    submissionId: "s1",
    currentStage: 3,
    passedStages: [1, 2],
    unlockedComponent: null,
    aiOrders: null,
    ...partial,
  };
}

describe("draftOf stage-4 seeding", () => {
  it("carries confirmCode from stage 2 and queue code+table from stage 3", () => {
    const draft = draftOf(stateWithDrafts(), 4);
    expect(draft).toEqual({
      confirmCode: "return similarity < 0.75",
      results: null,
      queueCode: "def priority(u, w, c): return u",
      priority: PRIORITY_TABLE,
    });
  });

  it("returns an empty combined draft when earlier stages have no drafts", () => {
    const draft = draftOf(createLunchLessonState(4), 4);
    expect(draft).toEqual({ confirmCode: "", results: null, queueCode: "", priority: null });
  });
});

describe("judge-result", () => {
  it("ships stage-4 orders with a stage-3 pass so no reload is needed", () => {
    const orders = [{ id: "F01", request: "3号桌牛肉面" }];
    const next = transitionLunchLesson(stateWithDrafts(), {
      type: "judge-result",
      outcome: outcome({
        passed: true,
        passedStages: [1, 2, 3],
        currentStage: 4,
        aiOrders: orders,
      }),
    });
    expect(next.aiOrders).toEqual(orders);
    expect(next.passedStages).toEqual([1, 2, 3]);
  });

  it("keeps aiOrders null while stage 4 stays locked", () => {
    const next = transitionLunchLesson(stateWithDrafts(), {
      type: "judge-result",
      outcome: outcome({ passed: false }),
    });
    expect(next.aiOrders).toBeNull();
  });

  it("slots the fresh summary into runSummaries so stage nav keeps it", () => {
    const summary = { kind: "queue" as const, onTime: 12, total: 12 };
    const state = transitionLunchLesson(stateWithDrafts(), {
      type: "judge-result",
      outcome: outcome({ passed: true, passedStages: [1, 2, 3], testSummary: summary }),
    });
    expect(state.runSummaries.queue).toEqual(summary);
    const away = transitionLunchLesson(state, { type: "select-stage", stageIndex: 4 });
    const back = transitionLunchLesson(away, { type: "select-stage", stageIndex: 3 });
    expect(back.runSummaries.queue).toEqual(summary);
  });

  it("unlocks core + stage 5 under freeNavigation and resets to stage 1 on isReset", () => {
    let staff = transitionLunchLesson(createLunchLessonState(1), {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      drafts: { 2: { confirmCode: "return True", results: [] } },
      aiOrders: [{ id: "F01", request: "牛肉面" }],
      freeNavigation: true,
    });
    staff = transitionLunchLesson(staff, { type: "select-stage", stageIndex: 5 });
    expect(staff.stageIndex).toBe(5);

    const reset = transitionLunchLesson(staff, {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      drafts: {},
      aiOrders: [{ id: "F01", request: "牛肉面" }],
      freeNavigation: true,
      isReset: true,
    });
    expect(reset.stageIndex).toBe(1);
    expect(reset.freeNavigation).toBe(true);
    expect(draftOf(reset, 2)).toEqual({ confirmCode: "", results: null });
    expect(reset.judgeOutcome).toBeNull();
  });
});
