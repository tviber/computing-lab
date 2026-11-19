import { describe, expect, it } from "vitest";
import {
  createSamplingLessonState,
  draftResolution,
  sanitizeDraft,
  transitionSamplingLesson,
} from "./state.ts";
import { getSamplingStage } from "../domain/stages.ts";
import { statusForStage } from "../../../shared/lab/saveStatus.ts";

const base = () => createSamplingLessonState(1);

describe("sampling lesson state", () => {
  it("stage 1 is open; later stages need the previous pass", () => {
    let state = base();
    state = transitionSamplingLesson(state, { type: "select-stage", stageIndex: 3 });
    expect(state.stageIndex).toBe(1); // still locked
    state = transitionSamplingLesson(state, {
      type: "judge-result",
      outcome: fakeOutcome(1, true),
    });
    state = transitionSamplingLesson(state, { type: "select-stage", stageIndex: 2 });
    expect(state.stageIndex).toBe(2);
  });

  it("square stages mirror width into height", () => {
    let state = base(); // stage 1 is square
    state = transitionSamplingLesson(state, {
      type: "set-resolution",
      width: 16,
      height: 4,
    });
    expect(draftResolution(state)).toEqual({ width: 16, height: 16 });
  });

  it("free stages keep width and height independent", () => {
    let state = transitionSamplingLesson(base(), {
      type: "load-project",
      currentStage: 5,
      passedStages: [1, 2, 3, 4],
      drafts: {},
    });
    state = transitionSamplingLesson(state, { type: "select-stage", stageIndex: 5 });
    state = transitionSamplingLesson(state, {
      type: "set-resolution",
      width: 16,
      height: 8,
    });
    expect(draftResolution(state)).toEqual({ width: 16, height: 8 });
  });

  it("a new resolution clears the previous verdict and marks dirty", () => {
    let state = base();
    state = transitionSamplingLesson(state, {
      type: "judge-result",
      outcome: fakeOutcome(1, false),
    });
    state = transitionSamplingLesson(state, {
      type: "set-resolution",
      width: 8,
      height: 8,
    });
    expect(state.judgeOutcome).toBeNull();
    expect(statusForStage(state.saveStatusByStage, state.stageIndex)).toBe("dirty");
  });

  it("load-project restores drafts and falls back to currentStage when locked", () => {
    const state = transitionSamplingLesson(base(), {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      drafts: { 2: { width: 24, height: 24, code: "x" } },
    });
    expect(state.stageIndex).toBe(1);
    expect(state.drafts[2]).toEqual({ width: 24, height: 24, code: "x" });
  });

  it("editing choose_size invalidates a stage 2 resolution", () => {
    let state = transitionSamplingLesson(base(), {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      drafts: { 2: { width: 24, height: 24, code: "return 24" } },
    });
    state = transitionSamplingLesson(state, { type: "select-stage", stageIndex: 2 });
    state = transitionSamplingLesson(state, {
      type: "set-code",
      code: "def choose_size(images):\n    return 28",
    });
    expect(state.drafts[2]).toEqual({
      width: null,
      height: null,
      code: "def choose_size(images):\n    return 28",
    });
    expect(draftResolution(state)).toBeNull();
  });
});

describe("sanitizeDraft", () => {
  it("drops junk and clamps numbers", () => {
    expect(sanitizeDraft({ width: 3.7, height: 500, code: "a" })).toEqual({
      width: 4,
      height: 64,
      code: "a",
    });
    expect(sanitizeDraft("nope")).toEqual({ width: null, height: null, code: "" });
  });
});

function fakeOutcome(stageIndex: number, passed: boolean) {
  const stage = getSamplingStage(stageIndex)!;
  return {
    resolution: { width: 8, height: 8, cells: 64 },
    identified: 9,
    total: 9,
    accuracy: 1,
    requiredAccuracy: stage.requiredAccuracy,
    cellBudget: stage.cellBudget,
    withinBudget: true,
    passed,
    counterexample: null,
    confusionPairs: [],
    submissionId: "s",
    currentStage: stageIndex + 1,
    passedStages: passed ? [stageIndex] : [],
  };
}

describe("sampling freeNavigation and reset", () => {
  it("allows staff free stage navigation and resets back to stage 1 on isReset", () => {
    let state = transitionSamplingLesson(base(), {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      drafts: { 2: { width: 16, height: 16, code: "return 16" } },
      freeNavigation: true,
    });
    state = transitionSamplingLesson(state, { type: "select-stage", stageIndex: 3 });
    expect(state.stageIndex).toBe(3);

    const reset = transitionSamplingLesson(state, {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      drafts: {},
      freeNavigation: true,
      isReset: true,
    });
    expect(reset.stageIndex).toBe(1);
    expect(reset.passedStages).toEqual([]);
    expect(reset.freeNavigation).toBe(true);
    expect(draftResolution(reset)).toBeNull();
  });
});
