/**
 * Shared types, selectors, scaffold helpers, and undo/dirty-stage utilities
 * for the calculator lesson state machine. Pure transitions only.
 */

import type { CaseResult } from "../domain/evaluate";
import {
  emptyGraph,
  gateInputPorts,
  gateOutputPorts,
  type Bit,
  type CircuitGraph,
  type CircuitNode,
  type ComponentDef,
  type NodeKind,
  type PortRef,
} from "../domain/graph";
import { getStage, stagePrerequisites, type StageDef } from "../domain/stages";

export type { SaveStatus } from "../../../shared/lab/contracts";
import {
  markSaveStatus,
  type SaveStatusByStage,
  type SyncConflictByStage,
} from "../../../shared/lab/saveStatus.ts";

/** First failing hidden case, echoed back by the judge for display. */
export type Counterexample = {
  name: string;
  category: string;
  inputs: Record<string, Bit>;
  expected: Record<string, Bit>;
  actual: Record<string, Bit | null>;
};

export type PendingWire = { from: PortRef } | null;

export type RunOutcome = {
  results: CaseResult[];
  score: number;
  total: number;
} | null;

export type JudgeOutcome = {
  score: number;
  total: number;
  passed: boolean;
  categories: Record<string, { passed: number; total: number }>;
  counterexample: Counterexample | null;
  passedStages: number[];
  error: string | null;
  unlockedComponent: string | null;
  /** Library revision after the judgement's own write (null = untouched). */
  componentsRevision: number | null;
  /** Authoritative library after the judgement's write, paired with componentsRevision. */
  unlockedSubmodules: ComponentDef[] | null;
} | null;

export type UndoSnapshot = {
  stageIndex: number;
  graph: CircuitGraph;
  unlockedSubmodules?: ComponentDef[];
  drafts?: Record<number, CircuitGraph>;
};

export type ComponentCatalog = Record<string, CircuitGraph | ComponentDef>;

export type CalculatorLessonState = {
  stageIndex: number;
  /** Next mainline stage; optional side challenges never advance this value. */
  currentStage: number;
  /** Stages fully passed, ascending, deduplicated. */
  passedStages: number[];
  guideAcknowledged: boolean;
  unlockedSubmodules: ComponentDef[];
  /** Monotonic server revision of the component library for OCC saves. */
  componentsRevision: number;
  /** Local mutation sequence of the component library. */
  componentsEditSeq: number;
  /** Highest library edit sequence confirmed by an applied save. */
  componentsConfirmedSeq: number;
  /** Invariant: true iff componentsEditSeq > componentsConfirmedSeq. */
  componentsChanged: boolean;
  /** Restorable backup of local components replaced by a server snapshot. */
  conflictedComponents: ComponentDef[] | null;
  /** Draft graph per stage index. */
  drafts: Record<number, CircuitGraph>;
  /** Restorable local drafts replaced by server copies during conflict resolution. */
  conflictedLocalDrafts: Record<number, CircuitGraph>;
  /** Monotonic server revision per stage for OCC saves. */
  draftRevisions: Record<number, number>;
  /** Undo stack of pre-edit snapshots tagged by stage. */
  past: UndoSnapshot[];
  /** Active node drag kept out of undo history until pointer release. */
  nodeMove: { stageIndex: number; nodeId: string; graph: CircuitGraph } | null;
  selectedNodeId: string | null;
  pendingWire: PendingWire;
  saveStatusByStage: SaveStatusByStage;
  /** Stages with an unreconciled sync-error whose retry trigger must stay visible. */
  unresolvedSyncConflicts: SyncConflictByStage;
  runOutcome: RunOutcome;
  judgeOutcome: JudgeOutcome;
  message: string | null;
  nextId: number;
};

export type CalculatorLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      guideAcknowledged?: boolean;
      unlockedSubmodules: ComponentDef[];
      drafts: Record<number, CircuitGraph>;
      draftRevisions?: Record<number, number>;
      componentsRevision?: number;
      stageIndex?: number;
      forceStage?: boolean;
      isReset?: boolean;
      draftNotice?: string;
    }
  | { type: "select-stage"; stageIndex: number; force?: boolean }
  | { type: "undo" }
  | { type: "start-node-move"; id: string }
  | { type: "finish-node-move" }
  | { type: "add-node"; kind: NodeKind; name?: string; value?: Bit; x: number; y: number }
  | {
      type: "componentize-selection";
      selectedIds: string[];
      name: string;
      inputNames: string[];
      outputNames: string[];
      inputPortKeys?: string[];
      outputPortKeys?: string[];
    }
  | {
      type: "edit-custom-component";
      name: string;
      /** New component name; omitted or equal to `name` keeps the old name. */
      newName?: string;
      inputNames: string[];
      outputNames: string[];
      inputPortKeys?: string[];
      outputPortKeys?: string[];
    }
  | { type: "expand-component"; id: string }
  | { type: "toggle-collapse-node"; id: string }
  | { type: "delete-custom-component"; name: string }
  | { type: "move-node"; id: string; x: number; y: number }
  | { type: "select-node"; id: string | null }
  | { type: "delete-node"; id: string }
  | { type: "delete-nodes"; ids: string[] }
  | { type: "toggle-input"; id: string }
  | { type: "start-wire"; from: PortRef }
  | { type: "complete-wire"; to: PortRef }
  | { type: "cancel-wire" }
  | { type: "delete-edge"; id: string }
  | { type: "reset-stage" }
  | { type: "run-public-tests" }
  | { type: "mark-saving"; stageIndex: number }
  | {
      type: "mark-saved";
      stageIndex: number;
      revision?: number;
      componentsRevision?: number;
      /** Library edit sequence carried by the confirming save request. */
      componentsSeq?: number;
    }
  | { type: "mark-save-error"; stageIndex: number }
  | { type: "mark-save-sync-error"; stageIndex: number }
  | {
      type: "resolve-save-conflict";
      stageIndex: number;
      /** Server draft for the stage; absent falls back to the stage scaffold. */
      draft?: CircuitGraph;
      revision?: number;
      unlockedSubmodules?: ComponentDef[];
      componentsRevision?: number;
    }
  | { type: "restore-conflict-draft"; stageIndex: number }
  | { type: "discard-conflict-draft"; stageIndex: number }
  | {
      type: "judge-result";
      /** Stage index captured at submission dispatch time. */
      stageIndex: number;
      outcome: NonNullable<JudgeOutcome>;
    }
  | { type: "acknowledge-full-adder-guide" }
  | { type: "dismiss-message" };

const MAX_UNDO = 50;

export function graphOf(state: CalculatorLessonState, stageIndex = state.stageIndex): CircuitGraph {
  return state.drafts[stageIndex] ?? emptyGraph();
}

export function stageOf(state: CalculatorLessonState): StageDef | undefined {
  return getStage(state.stageIndex);
}

export function isStageUnlocked(state: CalculatorLessonState, stageIndex: number): boolean {
  const stage = getStage(stageIndex);
  if (!stage) return false;
  return stagePrerequisites(stage).every((index) => state.passedStages.includes(index));
}

export function componentMap(state: CalculatorLessonState): Record<string, CircuitGraph> {
  return Object.fromEntries(state.unlockedSubmodules.map((s) => [s.name, s.graph]));
}

/** Keep custom-component metadata available to the canvas for explicit port ordering. */
export function componentCatalog(state: CalculatorLessonState): Record<string, ComponentDef> {
  return Object.fromEntries(
    state.unlockedSubmodules.map((component) => [component.name, component]),
  );
}

/** A stage starts with its required pins placed at fixed contract positions. */
export function scaffoldGraph(stageIndex: number): CircuitGraph {
  const stage = getStage(stageIndex);
  if (!stage) return emptyGraph();
  const nodes: CircuitNode[] = [];
  stage.inputs.forEach((name, index) => {
    nodes.push({ id: `in-${name}`, kind: "input", name, value: 0, x: 40, y: 40 + index * 46 });
  });
  stage.outputs.forEach((name, index) => {
    nodes.push({ id: `out-${name}`, kind: "output", name, x: 720, y: 40 + index * 46 });
  });
  return { nodes, edges: [] };
}

export function createCalculatorLessonState(stageIndex = 1): CalculatorLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    guideAcknowledged: false,
    unlockedSubmodules: [],
    componentsRevision: 0,
    componentsEditSeq: 0,
    componentsConfirmedSeq: 0,
    componentsChanged: false,
    conflictedComponents: null,
    drafts: { [stageIndex]: scaffoldGraph(stageIndex) },
    conflictedLocalDrafts: {},
    draftRevisions: {},
    past: [],
    nodeMove: null,
    selectedNodeId: null,
    pendingWire: null,
    saveStatusByStage: {},
    unresolvedSyncConflicts: {},
    runOutcome: null,
    judgeOutcome: null,
    message: null,
    nextId: 1,
  };
}

/**
 * Snap contract pins to the current scaffold slot order only if every pin
 * still sits on an original scaffold slot (no manual pin drag occurred).
 */
function realignScaffoldPins(graph: CircuitGraph, scaffold: CircuitGraph): CircuitGraph {
  const canonical = new Map(
    scaffold.nodes.map((node) => [`${node.kind}:${node.name ?? ""}`, node]),
  );
  const slots = new Map<string, Set<string>>();
  for (const node of scaffold.nodes) {
    const set = slots.get(node.kind) ?? new Set<string>();
    set.add(`${node.x},${node.y}`);
    slots.set(node.kind, set);
  }
  const pins = graph.nodes.filter((node) => node.kind === "input" || node.kind === "output");
  if (pins.length === 0) return graph;
  const untouched = pins.every(
    (node) =>
      canonical.has(`${node.kind}:${node.name ?? ""}`) &&
      slots.get(node.kind)?.has(`${node.x},${node.y}`),
  );
  if (!untouched) return graph;
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    if (node.kind !== "input" && node.kind !== "output") return node;
    const target = canonical.get(`${node.kind}:${node.name ?? ""}`);
    if (!target || (node.x === target.x && node.y === target.y)) return node;
    changed = true;
    return { ...node, x: target.x, y: target.y };
  });
  return changed ? { ...graph, nodes } : graph;
}

/** Ensure the stage's required pins exist even in a restored draft. */
export function withScaffold(graph: CircuitGraph, stageIndex: number): CircuitGraph {
  const scaffold = scaffoldGraph(stageIndex);
  if (graph.nodes.length === 0) return scaffold;
  const names = new Set(
    graph.nodes.filter((n) => n.kind === "input" || n.kind === "output").map((n) => n.name),
  );
  const missing = scaffold.nodes.filter((n) => !names.has(n.name));
  const merged = missing.length === 0 ? graph : { ...graph, nodes: [...graph.nodes, ...missing] };
  return realignScaffoldPins(merged, scaffold);
}

function numericPortName(name: string): { prefix: string; index: number } | null {
  const match = /^(.*?)(\d+)$/.exec(name);
  return match ? { prefix: match[1], index: Number(match[2]) } : null;
}

/** Keep numbered component ports low-to-high while preserving named ports. */
function orderComponentPorts(names: string[]): string[] {
  return names
    .map((name, originalIndex) => ({ name, originalIndex, numeric: numericPortName(name) }))
    .sort((left, right) => {
      if (!left.numeric && !right.numeric) return left.originalIndex - right.originalIndex;
      if (!left.numeric) return 1;
      if (!right.numeric) return -1;
      if (left.numeric.prefix !== right.numeric.prefix) {
        return left.originalIndex - right.originalIndex;
      }
      return left.numeric.index - right.numeric.index;
    })
    .map(({ name }) => name);
}

function componentPortsOf(
  node: CircuitNode,
  components: ComponentCatalog,
  direction: "in" | "out",
): string[] {
  const definition = components[node.name ?? ""];
  const graph = definition && "graph" in definition ? definition.graph : definition;
  if (!graph) return [];
  const kind = direction === "in" ? "input" : "output";
  const names = graph.nodes
    .filter((n) => n.kind === kind)
    .map((n) => n.name ?? "")
    .filter(Boolean);
  return definition && "graph" in definition && definition.custom
    ? names
    : orderComponentPorts(names);
}

export function portsForNode(
  node: CircuitNode,
  components: ComponentCatalog,
  direction: "in" | "out",
): string[] {
  if (node.kind === "component") return componentPortsOf(node, components, direction);
  return direction === "in" ? gateInputPorts(node) : gateOutputPorts(node);
}

export function appendPast(
  past: CalculatorLessonState["past"],
  snapshot: UndoSnapshot,
): CalculatorLessonState["past"] {
  const next = [...past, snapshot];
  if (next.length > MAX_UNDO) next.splice(0, next.length - MAX_UNDO);
  return next;
}

export function updateGraph(
  state: CalculatorLessonState,
  update: (graph: CircuitGraph) => CircuitGraph,
  recordHistory = true,
): CalculatorLessonState {
  const before = graphOf(state);
  const next = update(before);
  if (next === before) return state;
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: next },
    past: recordHistory
      ? appendPast(state.past, {
          stageIndex: state.stageIndex,
          graph: before,
          unlockedSubmodules: state.unlockedSubmodules,
        })
      : state.past,
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
    runOutcome: null,
    judgeOutcome: null,
  };
}

export function finishNodeMove(state: CalculatorLessonState): CalculatorLessonState {
  const move = state.nodeMove;
  if (!move) return state;
  if (move.stageIndex !== state.stageIndex) return { ...state, nodeMove: null };
  const current = graphOf(state);
  if (current === move.graph) return { ...state, nodeMove: null };
  return {
    ...state,
    nodeMove: null,
    past: appendPast(state.past, {
      stageIndex: state.stageIndex,
      graph: move.graph,
      unlockedSubmodules: state.unlockedSubmodules,
    }),
  };
}

/**
 * Mark every stage whose draft reference changed as dirty, plus `always` so
 * cross-stage component/library mutations are persisted even when the active
 * stage's own graph stayed unchanged.
 */
export function markDirtyStagesChanged(
  byStage: SaveStatusByStage,
  before: Record<number, CircuitGraph>,
  after: Record<number, CircuitGraph>,
  always: number,
): SaveStatusByStage {
  let next = markSaveStatus(byStage, always, "dirty");
  for (const [stage, graph] of Object.entries(after)) {
    const stageIndex = Number(stage);
    if (stageIndex !== always && graph !== before[stageIndex]) {
      next = markSaveStatus(next, stageIndex, "dirty");
    }
  }
  return next;
}
