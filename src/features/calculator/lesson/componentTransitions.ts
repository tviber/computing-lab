/**
 * Custom component encapsulation, port/name reference rewriting, expansion,
 * and dependency-checked deletion transitions.
 */

import { markSaveStatus } from "../../../shared/lab/saveStatus.ts";
import {
  componentizeSelection,
  editComponentPorts,
  expandComponentNode,
  isValidComponentIdentifier,
} from "../domain/componentize";
import { availableGraphSequence, type CircuitGraph } from "../domain/graph";
import {
  appendPast,
  graphOf,
  markDirtyStagesChanged,
  updateGraph,
  type CalculatorLessonAction,
  type CalculatorLessonState,
} from "./stateTypes.ts";

/** Find component definitions that directly or transitively depend on `targetName`. */
function componentDependents(state: CalculatorLessonState, targetName: string): string[] {
  const reverseDependencies = new Map<string, Set<string>>();

  for (const component of state.unlockedSubmodules) {
    const componentKey = component.name.toLocaleLowerCase();
    for (const node of component.graph.nodes) {
      if (node.kind !== "component" || !node.name) continue;
      const dependencyKey = node.name.toLocaleLowerCase();
      const dependents = reverseDependencies.get(dependencyKey) ?? new Set<string>();
      dependents.add(componentKey);
      reverseDependencies.set(dependencyKey, dependents);
    }
  }

  const targetKey = targetName.toLocaleLowerCase();
  const dependentKeys = new Set<string>();
  const pending = [targetKey];
  while (pending.length > 0) {
    const dependencyKey = pending.shift();
    if (!dependencyKey) continue;
    for (const dependentKey of reverseDependencies.get(dependencyKey) ?? []) {
      if (dependentKey === targetKey || dependentKeys.has(dependentKey)) continue;
      dependentKeys.add(dependentKey);
      pending.push(dependentKey);
    }
  }

  return state.unlockedSubmodules
    .filter((component) => dependentKeys.has(component.name.toLocaleLowerCase()))
    .map((component) => component.name);
}

/** Point every component instance referencing `from` at `to`. */
function rewriteComponentNameReferences(
  graph: CircuitGraph,
  from: string,
  to: string,
): CircuitGraph {
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    if (node.kind === "component" && node.name === from) {
      changed = true;
      return { ...node, name: to };
    }
    return node;
  });
  return changed ? { ...graph, nodes } : graph;
}

function rewriteComponentPortReferences(
  graph: CircuitGraph,
  componentName: string,
  inputPortRenames: Record<string, string>,
  outputPortRenames: Record<string, string>,
): CircuitGraph {
  let changed = false;
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = graph.edges.map((edge) => {
    const fromNode = nodesById.get(edge.from.node);
    const toNode = nodesById.get(edge.to.node);
    const fromPort =
      fromNode?.kind === "component" && fromNode.name === componentName
        ? (outputPortRenames[edge.from.port] ?? edge.from.port)
        : edge.from.port;
    const toPort =
      toNode?.kind === "component" && toNode.name === componentName
        ? (inputPortRenames[edge.to.port] ?? edge.to.port)
        : edge.to.port;
    if (fromPort === edge.from.port && toPort === edge.to.port) return edge;
    changed = true;
    return {
      ...edge,
      from: { ...edge.from, port: fromPort },
      to: { ...edge.to, port: toPort },
    };
  });
  return changed ? { ...graph, edges } : graph;
}

export function componentizeSelectionAction(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "componentize-selection" }>,
): CalculatorLessonState {
  const name = action.name.trim();
  if (
    state.unlockedSubmodules.some(
      (component) => component.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  ) {
    return { ...state, message: `组件名称“${name}”已存在，请换一个名称。` };
  }
  const sequence = availableGraphSequence(graphOf(state), state.nextId);
  const componentNodeId = `n${sequence}`;
  const result = componentizeSelection({
    graph: graphOf(state),
    selectedIds: action.selectedIds,
    name,
    inputNames: action.inputNames,
    outputNames: action.outputNames,
    inputPortKeys: action.inputPortKeys,
    outputPortKeys: action.outputPortKeys,
    componentNodeId,
    edgeIdPrefix: `e${sequence}-component`,
  });
  if ("error" in result) return { ...state, message: result.error };
  const before = graphOf(state);
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: result.graph },
    past: appendPast(state.past, {
      stageIndex: state.stageIndex,
      graph: before,
      unlockedSubmodules: state.unlockedSubmodules,
    }),
    nodeMove: null,
    unlockedSubmodules: [...state.unlockedSubmodules, result.component],
    componentsEditSeq: state.componentsEditSeq + 1,
    componentsChanged: true,
    selectedNodeId: componentNodeId,
    pendingWire: null,
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
    runOutcome: null,
    judgeOutcome: null,
    message: `已封装“${name}”，现在可以从“我的组件”中重复放置。`,
    nextId: sequence + 1,
  };
}

export function editCustomComponent(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "edit-custom-component" }>,
): CalculatorLessonState {
  const component = state.unlockedSubmodules.find(
    (candidate) =>
      candidate.custom && candidate.name.toLocaleLowerCase() === action.name.toLocaleLowerCase(),
  );
  if (!component) return { ...state, message: "找不到要编辑的自定义组件。" };

  const nextName = (action.newName ?? component.name).trim();
  if (!isValidComponentIdentifier(nextName)) {
    return {
      ...state,
      message: "组件名称只能使用字母、数字、下划线或连字符，且需以字母或下划线开头。",
    };
  }
  const renamed = nextName !== component.name;
  if (
    renamed &&
    state.unlockedSubmodules.some(
      (candidate) =>
        candidate !== component &&
        candidate.name.toLocaleLowerCase() === nextName.toLocaleLowerCase(),
    )
  ) {
    return { ...state, message: `组件名称“${nextName}”已存在，请换一个名称。` };
  }

  const result = editComponentPorts({
    component,
    inputNames: action.inputNames,
    outputNames: action.outputNames,
    inputPortKeys: action.inputPortKeys,
    outputPortKeys: action.outputPortKeys,
  });
  if ("error" in result) return { ...state, message: result.error };

  const updateReferences = (graph: CircuitGraph) => {
    const portsRewritten = rewriteComponentPortReferences(
      graph,
      component.name,
      result.inputPortRenames,
      result.outputPortRenames,
    );
    return renamed
      ? rewriteComponentNameReferences(portsRewritten, component.name, nextName)
      : portsRewritten;
  };
  const editedComponent = {
    ...result.component,
    name: nextName,
    graph: updateReferences(result.component.graph),
  };
  const unlockedSubmodules = state.unlockedSubmodules.map((candidate) => {
    if (candidate === component) return editedComponent;
    const graph = updateReferences(candidate.graph);
    return graph === candidate.graph ? candidate : { ...candidate, graph };
  });
  const drafts = Object.fromEntries(
    Object.entries(state.drafts).map(([stage, graph]) => [stage, updateReferences(graph)]),
  );

  return {
    ...state,
    drafts,
    unlockedSubmodules,
    componentsEditSeq: state.componentsEditSeq + 1,
    componentsChanged: true,
    past: appendPast(state.past, {
      stageIndex: state.stageIndex,
      graph: graphOf(state),
      drafts: state.drafts,
      unlockedSubmodules: state.unlockedSubmodules,
    }),
    nodeMove: null,
    saveStatusByStage: markDirtyStagesChanged(
      state.saveStatusByStage,
      state.drafts,
      drafts,
      state.stageIndex,
    ),
    runOutcome: null,
    judgeOutcome: null,
    message: `已更新自定义组件“${nextName}”。`,
  };
}

export function expandComponent(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "expand-component" }>,
): CalculatorLessonState {
  const node = graphOf(state).nodes.find((candidate) => candidate.id === action.id);
  const component = state.unlockedSubmodules.find(
    (candidate) =>
      candidate.custom &&
      candidate.name.toLocaleLowerCase() === (node?.name ?? "").toLocaleLowerCase(),
  );
  if (!node || node.kind !== "component" || !component) {
    return { ...state, message: "请先选中画布中的自定义组件。" };
  }
  const sequence = availableGraphSequence(graphOf(state), state.nextId);
  const result = expandComponentNode({
    graph: graphOf(state),
    componentNodeId: action.id,
    component,
    edgeIdPrefix: `e${sequence}-split`,
  });
  if ("error" in result) return { ...state, message: result.error };
  return {
    ...updateGraph(state, () => result.graph),
    selectedNodeId: null,
    pendingWire: null,
    message: `已拆分“${component.name}”，内部逻辑已恢复到画布。`,
    nextId: sequence + 1,
  };
}

export function deleteCustomComponent(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "delete-custom-component" }>,
): CalculatorLessonState {
  const name = action.name.trim();
  const component = state.unlockedSubmodules.find(
    (candidate) =>
      candidate.custom && candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  if (!component) return state;
  const isUsed = Object.values(state.drafts).some((graph) =>
    graph.nodes.some(
      (node) =>
        node.kind === "component" &&
        node.name?.toLocaleLowerCase() === component.name.toLocaleLowerCase(),
    ),
  );
  const usedByComponents = componentDependents(state, component.name);
  if (isUsed || usedByComponents.length > 0) {
    const usageMessage = usedByComponents.length
      ? `仍被组件定义“${usedByComponents.join("、")}”使用，请先拆分或删除这些组件。`
      : "仍在画布中使用，请先拆分或删除画布中的实例。";
    return {
      ...state,
      message: `“${component.name}”${usageMessage}`,
    };
  }
  return {
    ...state,
    unlockedSubmodules: state.unlockedSubmodules.filter((candidate) => candidate !== component),
    componentsEditSeq: state.componentsEditSeq + 1,
    componentsChanged: true,
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
    runOutcome: null,
    judgeOutcome: null,
    message: `已删除自定义组件“${component.name}”。`,
  };
}
