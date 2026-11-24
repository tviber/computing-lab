import { expect, it } from "vitest";
import {
  createCalculatorLessonState,
  graphOf,
  scaffoldGraph,
  transitionCalculatorLesson,
} from "./state";

it("keeps restored nodes and wires intact when adding, wiring and deleting a new gate", () => {
  const original = scaffoldGraph(2);
  original.nodes.push({ id: "n1", kind: "xor", x: 240, y: 80 });
  original.edges.push({
    id: "e3",
    from: { node: "in-A", port: "out" },
    to: { node: "n1", port: "in0" },
  });
  let state = transitionCalculatorLesson(createCalculatorLessonState(2), {
    type: "load-project",
    currentStage: 2,
    passedStages: [],
    drafts: { 2: original },
    unlockedSubmodules: [],
  });
  state = transitionCalculatorLesson(state, { type: "add-node", kind: "and", x: 340, y: 80 });
  const newId = state.selectedNodeId!;
  expect(newId).not.toBe("n1");
  state = transitionCalculatorLesson(state, {
    type: "start-wire",
    from: { node: "in-B", port: "out" },
  });
  state = transitionCalculatorLesson(state, {
    type: "complete-wire",
    to: { node: newId, port: "in0" },
  });
  const wires = graphOf(state).edges;
  expect(wires).toHaveLength(2);
  expect(wires[1].id).not.toBe(wires[0].id);
  state = transitionCalculatorLesson(state, { type: "delete-edge", id: wires[1].id });
  state = transitionCalculatorLesson(state, { type: "delete-node", id: newId });
  expect(graphOf(state)).toEqual(original);
});
