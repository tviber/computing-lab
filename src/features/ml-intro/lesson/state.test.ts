import { describe, expect, it } from "vitest";
import { createMlLessonState, draftOf, sanitizeMlDraft, transitionMlLesson } from "./state.ts";
import { mlStageUnlocked, nextMlStage } from "../domain/stages.ts";

describe("ml-intro lesson state", () => {
  it("unlocks stages linearly from 1 through 5", () => {
    expect(mlStageUnlocked([], 1)).toBe(true);
    expect(mlStageUnlocked([], 2)).toBe(false);
    expect(mlStageUnlocked([1], 2)).toBe(true);
    expect(mlStageUnlocked([1, 2, 3, 4], 5)).toBe(true);
    expect(nextMlStage([])).toBe(1);
    expect(nextMlStage([1, 2])).toBe(3);
    expect(nextMlStage([1, 2, 3, 4, 5])).toBe(6);
  });

  it("clamps and sanitizes out-of-range parameters at the boundary", () => {
    const s2 = sanitizeMlDraft(2, {
      weights: { 免费: 99, 同学: -99, unknown: 5 },
      bias: -10,
      selectedMsgId: "bogus",
      concepts: { "bias-meaning": 1, bad: -1 },
    });
    expect("bias" in s2 && s2.bias).toBe(-3);
    if ("weights" in s2) {
      expect(s2.weights["免费"]).toBe(4);
      expect(s2.weights["同学"]).toBe(-4);
      expect(s2.weights["unknown"]).toBeUndefined();
    }

    const s5 = sanitizeMlDraft(5, {
      sampleSize: 99999,
      eta: 100,
      epochs: 500,
      threshold: 0.999,
    });
    if ("sampleSize" in s5) {
      expect(s5.sampleSize).toBe(1400);
      expect(s5.eta).toBe(5);
      expect(s5.epochs).toBe(30);
      expect(s5.threshold).toBe(0.95);
    }
  });

  it("handles OCC save status, conflict backup restore, and stage navigation", () => {
    let state = createMlLessonState(1);
    state = transitionMlLesson(state, {
      type: "update-stage1",
      draft: {
        selectedPresetId: "promo",
        customText: "测试",
        classifications: { "tok-0": "kept" },
        concepts: {},
      },
    });
    expect(state.saveStatusByStage[1]).toBe("dirty");

    state = transitionMlLesson(state, { type: "mark-saving", stageIndex: 1 });
    state = transitionMlLesson(state, {
      type: "resolve-save-conflict",
      stageIndex: 1,
      draft: {
        selectedPresetId: "promo",
        customText: "服务端版本",
        classifications: {},
        concepts: {},
      },
      revision: 3,
    });
    expect(state.saveStatusByStage[1]).toBe("conflict");
    expect(state.draftRevisions[1]).toBe(3);
    expect((draftOf(state, 1) as { customText: string }).customText).toBe("服务端版本");

    state = transitionMlLesson(state, { type: "restore-conflict-draft", stageIndex: 1 });
    expect((draftOf(state, 1) as { customText: string }).customText).toBe("测试");
    expect(state.saveStatusByStage[1]).toBe("dirty");

    state = transitionMlLesson(state, { type: "select-stage", stageIndex: 2 });
    expect(state.stageIndex).toBe(1);
  });
});
