import { describe, expect, it } from "vitest";
import {
  createMlLessonState,
  draftOf,
  isStageUnlocked,
  sanitizeMlDraft,
  transitionMlLesson,
} from "./state.ts";
import { mlStageUnlocked, nextMlStage } from "../domain/stages.ts";

describe("ml-intro lesson state", () => {
  it("unlocks stages linearly from 1 through 6", () => {
    expect(mlStageUnlocked([], 1)).toBe(true);
    expect(mlStageUnlocked([], 2)).toBe(false);
    expect(mlStageUnlocked([1], 2)).toBe(true);
    expect(mlStageUnlocked([2, 3], 2)).toBe(true);
    expect(mlStageUnlocked([2, 3], 4)).toBe(true);
    expect(mlStageUnlocked([1, 2, 3, 4, 5], 6)).toBe(true);
    expect(nextMlStage([])).toBe(1);
    expect(nextMlStage([1, 2])).toBe(3);
    expect(nextMlStage([1, 2, 3, 4, 5, 6])).toBe(7);
  });

  it("clamps and sanitizes out-of-range parameters at the boundary", () => {
    const s1 = sanitizeMlDraft(1, {
      weights: { 中奖: 99, 妈妈: -99, unknown: 5 },
      selectedMsgId: "bogus",
      concepts: { "dot-product-strategy": 1, bad: -1 },
    });
    if ("weights" in s1) {
      expect(s1.weights["中奖"]).toBe(2);
      expect(s1.weights["妈妈"]).toBe(-2);
      expect(s1.weights["unknown"]).toBeUndefined();
    }

    const s3 = sanitizeMlDraft(3, {
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

    const s6 = sanitizeMlDraft(6, {
      sampleSize: 99999,
      eta: 100,
      epochs: 500,
      threshold: 0.999,
    });
    if ("sampleSize" in s6) {
      expect(s6.sampleSize).toBe(1400);
      expect(s6.eta).toBe(5);
      expect(s6.epochs).toBe(30);
      expect(s6.threshold).toBe(0.95);
    }
  });

  it("handles OCC save status, conflict backup restore, and stage navigation", () => {
    let state = createMlLessonState(1);
    state = transitionMlLesson(state, {
      type: "update-stage1",
      draft: {
        weights: { 中奖: 3, 妈妈: -3 },
        selectedMsgId: "st-spam-1",
        concepts: {},
      },
    });
    expect(state.saveStatusByStage[1]).toBe("dirty");

    state = transitionMlLesson(state, { type: "mark-saving", stageIndex: 1 });
    state = transitionMlLesson(state, {
      type: "resolve-save-conflict",
      stageIndex: 1,
      draft: {
        weights: { 中奖: 1, 妈妈: -1 },
        selectedMsgId: "st-ham-1",
        concepts: {},
      },
      revision: 3,
    });
    expect(state.saveStatusByStage[1]).toBe("conflict");
    expect(state.draftRevisions[1]).toBe(3);
    expect((draftOf(state, 1) as { selectedMsgId: string }).selectedMsgId).toBe("st-ham-1");

    state = transitionMlLesson(state, { type: "restore-conflict-draft", stageIndex: 1 });
    expect((draftOf(state, 1) as { selectedMsgId: string }).selectedMsgId).toBe("st-spam-1");
    expect(state.saveStatusByStage[1]).toBe("dirty");

    state = transitionMlLesson(state, { type: "select-stage", stageIndex: 2 });
    expect(state.stageIndex).toBe(1);

    // Classroom mode allows navigating across all stages without altering formal passedStages,
    // and turning it off returns to the highest formally reachable stage.
    state = transitionMlLesson(state, { type: "set-classroom-mode", enabled: true });
    expect(isStageUnlocked(state, 4)).toBe(true);
    state = transitionMlLesson(state, { type: "select-stage", stageIndex: 4 });
    expect(state.stageIndex).toBe(4);

    state = transitionMlLesson(state, { type: "set-classroom-mode", enabled: false });
    expect(state.stageIndex).toBe(1);
    expect(isStageUnlocked(state, 4)).toBe(false);
  });
});
