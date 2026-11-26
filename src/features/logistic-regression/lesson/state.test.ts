import { describe, expect, it } from "vitest";
import {
  createLogisticRegressionLessonState,
  draftOf,
  isStageUnlocked,
  sanitizeLogisticRegressionDraft,
  transitionLogisticRegressionLesson,
} from "./state.ts";
import { logisticRegressionStageUnlocked, nextLogisticRegressionStage } from "../domain/stages.ts";

describe("logistic-regression lesson state", () => {
  it("keeps the five-stage core linear and unlocks the bonus after training", () => {
    expect(logisticRegressionStageUnlocked([], 1)).toBe(true);
    expect(logisticRegressionStageUnlocked([], 2)).toBe(false);
    expect(logisticRegressionStageUnlocked([1], 2)).toBe(true);
    expect(logisticRegressionStageUnlocked([2, 3], 2)).toBe(false);
    expect(logisticRegressionStageUnlocked([2, 3], 4)).toBe(false);
    expect(logisticRegressionStageUnlocked([1, 2, 3], 4)).toBe(true);
    expect(logisticRegressionStageUnlocked([1, 2, 3, 4], 5)).toBe(true);
    expect(logisticRegressionStageUnlocked([1, 2, 3], 6)).toBe(false);
    expect(logisticRegressionStageUnlocked([1, 2, 3, 4], 6)).toBe(true);
    expect(nextLogisticRegressionStage([])).toBe(1);
    expect(nextLogisticRegressionStage([1, 2])).toBe(3);
    expect(nextLogisticRegressionStage([1, 2, 3, 4, 5])).toBe(6);
  });

  it("restores older drafts with an independent default bonus draft", () => {
    const loaded = transitionLogisticRegressionLesson(createLogisticRegressionLessonState(), {
      type: "load-project",
      currentStage: 5,
      passedStages: [1, 2, 3, 4],
      drafts: {},
    });
    expect(draftOf(loaded, 6)).toHaveProperty("code");
    expect(sanitizeLogisticRegressionDraft(6, null)).toHaveProperty("concepts", {});
  });

  it("clamps and sanitizes out-of-range parameters at the boundary", () => {
    const s1 = sanitizeLogisticRegressionDraft(1, {
      weights: { 中奖: 99, 妈妈: -99, unknown: 5 },
      selectedMsgId: "st-ham-1",
      concepts: { "dot-product-strategy": 1, bad: -1 },
    });
    expect(s1).not.toHaveProperty("selectedMsgId");
    if ("weights" in s1) {
      expect(s1.weights["中奖"]).toBe(2);
      expect(s1.weights["妈妈"]).toBe(-2);
      expect(s1.weights["unknown"]).toBeUndefined();
    }

    const s3 = sanitizeLogisticRegressionDraft(3, {
      weights: { 免费: 99, 同学: -99, unknown: 5 },
      bias: -10,
      selectedMsgId: "bogus",
      concepts: { "bias-meaning": 1, bad: -1 },
    });
    expect("bias" in s3 && s3.bias).toBe(-3);
    if ("weights" in s3) {
      expect(s3.weights["免费"]).toBe(4);
      expect(s3.weights["同学"]).toBe(-4);
      expect(s3.weights["unknown"]).toBeUndefined();
    }

    expect(sanitizeLogisticRegressionDraft(4, { eta: 100, epochs: 500 })).toMatchObject({
      eta: 5,
      epochs: 30,
    });
  });

  it("handles OCC save status, conflict backup restore, and stage navigation", () => {
    let state = createLogisticRegressionLessonState(1);
    state = transitionLogisticRegressionLesson(state, {
      type: "update-stage1",
      draft: {
        weights: { 中奖: 3, 妈妈: -3 },
        concepts: {},
      },
    });
    expect(state.saveStatusByStage[1]).toBe("dirty");

    state = transitionLogisticRegressionLesson(state, { type: "mark-saving", stageIndex: 1 });
    state = transitionLogisticRegressionLesson(state, {
      type: "resolve-save-conflict",
      stageIndex: 1,
      draft: {
        weights: { 中奖: 1, 妈妈: -1 },
        concepts: {},
      },
      revision: 3,
    });
    expect(state.saveStatusByStage[1]).toBe("conflict");
    expect(state.draftRevisions[1]).toBe(3);
    expect(draftOf(state, 1)).toMatchObject({ weights: { 中奖: 1 } });

    state = transitionLogisticRegressionLesson(state, {
      type: "restore-conflict-draft",
      stageIndex: 1,
    });
    expect(draftOf(state, 1)).toMatchObject({ weights: { 中奖: 2 } });
    expect(state.saveStatusByStage[1]).toBe("dirty");

    state = transitionLogisticRegressionLesson(state, { type: "select-stage", stageIndex: 2 });
    expect(state.stageIndex).toBe(1);

    expect(isStageUnlocked(state, 4)).toBe(false);
  });

  it("honors unlocked requested stages and otherwise opens the next available stage", () => {
    const serverProject = {
      type: "load-project" as const,
      currentStage: 4,
      passedStages: [1, 2, 3],
      drafts: {},
    };

    const pinnedFirstStage = transitionLogisticRegressionLesson(
      createLogisticRegressionLessonState(1),
      serverProject,
    );
    expect(pinnedFirstStage.stageIndex).toBe(1);

    const omittedStage = transitionLogisticRegressionLesson(
      createLogisticRegressionLessonState(),
      serverProject,
    );
    expect(omittedStage.stageIndex).toBe(4);

    const navigatedToSecond = transitionLogisticRegressionLesson(omittedStage, {
      type: "select-stage",
      stageIndex: 2,
    });
    const afterConflictReload = transitionLogisticRegressionLesson(
      navigatedToSecond,
      serverProject,
    );
    expect(afterConflictReload.stageIndex).toBe(2);
  });

  it("clears the pinned stage and opens the server's restart point on reset", () => {
    const loaded = transitionLogisticRegressionLesson(createLogisticRegressionLessonState(5), {
      type: "load-project",
      currentStage: 6,
      passedStages: [1, 2, 3, 4, 5],
      drafts: {},
    });
    expect(loaded.stageIndex).toBe(5);

    const reset = transitionLogisticRegressionLesson(loaded, {
      type: "load-project",
      currentStage: 3,
      passedStages: [1, 2],
      drafts: {},
      isReset: true,
    });
    expect(reset.stageIndex).toBe(3);
    expect(reset.pinnedStage).toBeNull();
    expect(isStageUnlocked(reset, 5)).toBe(false);
  });
});
