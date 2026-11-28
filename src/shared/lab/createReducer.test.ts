// @vitest-environment jsdom
import { createEffect, createRoot, flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { createReducer } from "./createReducer";

type State = {
  stageIndex: number;
  drafts: Record<number, { code: string }>;
  payload: number[];
  message: string | null;
};

type Action =
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-code"; stageIndex: number; code: string }
  | { type: "message"; text: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "select-stage":
      return state.stageIndex === action.stageIndex
        ? state
        : { ...state, stageIndex: action.stageIndex };
    case "set-code":
      return {
        ...state,
        drafts: { ...state.drafts, [action.stageIndex]: { code: action.code } },
      };
    case "message":
      return state.message === action.text ? state : { ...state, message: action.text };
  }
}

describe("createReducer", () => {
  it("notifies only effects that read the changed top-level slice", () => {
    let dispatch!: (action: Action) => void;
    let stageRuns = 0;
    let draftsRuns = 0;
    let messageRuns = 0;

    const dispose = createRoot((dispose) => {
      const [state, localDispatch] = createReducer(reducer, {
        stageIndex: 1,
        drafts: { 1: { code: "" }, 2: { code: "" } },
        payload: [1, 2, 3],
        message: null,
      });
      dispatch = localDispatch;

      createEffect(
        () => state().stageIndex,
        () => {
          stageRuns++;
        },
      );
      createEffect(
        () => state().drafts,
        () => {
          draftsRuns++;
        },
      );
      createEffect(
        () => state().message,
        () => {
          messageRuns++;
        },
      );
      return dispose;
    });
    flush();
    const initialStageRuns = stageRuns;
    const initialDraftsRuns = draftsRuns;
    const initialMessageRuns = messageRuns;

    dispatch({ type: "set-code", stageIndex: 1, code: "edited" });
    flush();
    expect(stageRuns).toBe(initialStageRuns);
    expect(draftsRuns).toBe(initialDraftsRuns + 1);
    expect(messageRuns).toBe(initialMessageRuns);

    dispatch({ type: "select-stage", stageIndex: 2 });
    flush();
    expect(stageRuns).toBe(initialStageRuns + 1);
    expect(draftsRuns).toBe(initialDraftsRuns + 1);
    expect(messageRuns).toBe(initialMessageRuns);

    dispatch({ type: "message", text: "ready" });
    flush();
    expect(stageRuns).toBe(initialStageRuns + 1);
    expect(draftsRuns).toBe(initialDraftsRuns + 1);
    expect(messageRuns).toBe(initialMessageRuns + 1);

    dispose();
  });

  it("keeps draft maps as fresh immutable plain objects for autosave and workers", () => {
    let dispatch!: (action: Action) => void;
    let readState!: () => State;

    const dispose = createRoot((dispose) => {
      const [state, localDispatch] = createReducer(reducer, {
        stageIndex: 1,
        drafts: { 1: { code: "first" } },
        payload: [1, 2, 3],
        message: null,
      });
      dispatch = localDispatch;
      readState = state;
      return dispose;
    });

    const firstDrafts = readState().drafts;
    const firstDraft = firstDrafts[1];
    expect(structuredClone(readState())).toEqual({
      stageIndex: 1,
      drafts: { 1: { code: "first" } },
      payload: [1, 2, 3],
      message: null,
    });

    dispatch({ type: "set-code", stageIndex: 1, code: "second" });
    flush();

    expect(readState().drafts).not.toBe(firstDrafts);
    expect(readState().drafts[1]).not.toBe(firstDraft);
    expect(firstDrafts).toEqual({ 1: { code: "first" } });
    expect(structuredClone(readState().drafts)).toEqual({ 1: { code: "second" } });
    expect(structuredClone(readState().payload)).toEqual([1, 2, 3]);

    dispose();
  });
});
