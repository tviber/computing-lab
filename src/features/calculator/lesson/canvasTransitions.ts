/**
 * Pure canvas-editing transitions for the calculator lesson state machine:
 * stage selection, node/wire manipulation, undo, reset, and public test runs.
 */

import { runCases } from "../domain/evaluate";
import {
  availableGraphSequence,
  emptyGraph,
  withoutNodes,
  type CircuitEdge,
  type CircuitNode,
} from "../domain/graph";
import { publicCasesFor } from "./publicCases";
import {
  componentMap,
  finishNodeMove,
  graphOf,
  isStageUnlocked,
  markDirtyStagesChanged,
  scaffoldGraph,
  updateGraph,
  withScaffold,
  type CalculatorLessonAction,
  type CalculatorLessonState,
} from "./stateTypes.ts";

export function selectStage(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "select-stage" }>,
): CalculatorLessonState {
  if (!action.force && !isStageUnlocked(state, action.stageIndex)) return state;
  const existing = state.drafts[action.stageIndex];
  return {
    ...state,
    stageIndex: action.stageIndex,
    drafts: {
      ...state.drafts,
      [action.stageIndex]: withScaffold(existing ?? emptyGraph(), action.stageIndex),
    },
    nodeMove: null,
    selectedNodeId: null,
    pendingWire: null,
    runOutcome: null,
    judgeOutcome: null,
  };
}

export function addNode(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "add-node" }>,
): CalculatorLessonState {
  const sequence = availableGraphSequence(graphOf(state), state.nextId);
  const id = `n${sequence}`;
  const node: CircuitNode = {
    id,
    kind: action.kind,
    name: action.name,
    value: action.value,
    x: action.x,
    y: action.y,
  };
  return {
    ...updateGraph(state, (graph) => ({ ...graph, nodes: [...graph.nodes, node] })),
    nextId: sequence + 1,
    selectedNodeId: id,
  };
}

export function startNodeMove(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "start-node-move" }>,
): CalculatorLessonState {
  if (!graphOf(state).nodes.some((node) => node.id === action.id)) return state;
  return {
    ...state,
    nodeMove: { stageIndex: state.stageIndex, nodeId: action.id, graph: graphOf(state) },
  };
}

export function toggleCollapseNode(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "toggle-collapse-node" }>,
): CalculatorLessonState {
  const node = graphOf(state).nodes.find((candidate) => candidate.id === action.id);
  if (!node || node.kind !== "component") return state;
  return updateGraph(state, (graph) => ({
    ...graph,
    nodes: graph.nodes.map((candidate) =>
      candidate.id === action.id ? { ...candidate, collapsed: !candidate.collapsed } : candidate,
    ),
  }));
}

export function moveNode(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "move-node" }>,
): CalculatorLessonState {
  return updateGraph(
    state,
    (graph) => {
      let changed = false;
      const nodes = graph.nodes.map((node) => {
        if (node.id !== action.id || (node.x === action.x && node.y === action.y)) return node;
        changed = true;
        return { ...node, x: action.x, y: action.y };
      });
      return changed ? { ...graph, nodes } : graph;
    },
    !state.nodeMove || state.nodeMove.nodeId !== action.id,
  );
}

export function deleteNodes(state: CalculatorLessonState, ids: string[]): CalculatorLessonState {
  const requested = new Set(ids);
  const graph = graphOf(state);
  const removable = new Set(
    graph.nodes
      .filter((node) => requested.has(node.id) && node.kind !== "input" && node.kind !== "output")
      .map((node) => node.id),
  );
  if (removable.size === 0) return state;
  return {
    ...updateGraph(state, (current) => withoutNodes(current, removable)),
    selectedNodeId:
      state.selectedNodeId && removable.has(state.selectedNodeId) ? null : state.selectedNodeId,
    nodeMove: null,
  };
}

export function toggleInput(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "toggle-input" }>,
): CalculatorLessonState {
  return updateGraph(state, (graph) => ({
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === action.id && (n.kind === "input" || n.kind === "const")
        ? { ...n, value: n.value === 1 ? 0 : 1 }
        : n,
    ),
  }));
}

export function completeWire(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "complete-wire" }>,
): CalculatorLessonState {
  const pending = state.pendingWire;
  if (!pending) return state;
  if (pending.from.node === action.to.node) return { ...state, pendingWire: null };
  const sequence = availableGraphSequence(graphOf(state), state.nextId);
  const edge: CircuitEdge = {
    id: `e${sequence}`,
    from: pending.from,
    to: action.to,
  };
  return {
    ...updateGraph(state, (graph) => ({
      ...graph,
      // One driver per input port: replace any existing edge into it.
      edges: [
        ...graph.edges.filter(
          (e) => !(e.to.node === action.to.node && e.to.port === action.to.port),
        ),
        edge,
      ],
    })),
    pendingWire: null,
    nextId: sequence + 1,
  };
}

export function deleteEdge(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "delete-edge" }>,
): CalculatorLessonState {
  return updateGraph(state, (graph) => ({
    ...graph,
    edges: graph.edges.filter((e) => e.id !== action.id),
  }));
}

export function resetStage(state: CalculatorLessonState): CalculatorLessonState {
  return {
    ...updateGraph(state, () => scaffoldGraph(state.stageIndex)),
    nodeMove: null,
    selectedNodeId: null,
    pendingWire: null,
  };
}

export function undoEdit(state: CalculatorLessonState): CalculatorLessonState {
  const settled = finishNodeMove(state);
  const top = settled.past[settled.past.length - 1];
  // Only restore a snapshot made on the stage currently on screen.
  if (!top || top.stageIndex !== settled.stageIndex) return settled;
  const restoredDrafts = top.drafts ?? { ...settled.drafts, [settled.stageIndex]: top.graph };
  return {
    ...settled,
    drafts: restoredDrafts,
    unlockedSubmodules: top.unlockedSubmodules ?? settled.unlockedSubmodules,
    componentsEditSeq:
      top.unlockedSubmodules !== undefined
        ? settled.componentsEditSeq + 1
        : settled.componentsEditSeq,
    componentsChanged: top.unlockedSubmodules !== undefined || settled.componentsChanged,
    past: settled.past.slice(0, -1),
    nodeMove: null,
    saveStatusByStage: markDirtyStagesChanged(
      state.saveStatusByStage,
      settled.drafts,
      restoredDrafts,
      settled.stageIndex,
    ),
    runOutcome: null,
    judgeOutcome: null,
  };
}

export function runPublicTests(state: CalculatorLessonState): CalculatorLessonState {
  const outcome = runCases(graphOf(state), publicCasesFor(state.stageIndex), componentMap(state));
  return { ...state, runOutcome: outcome };
}
