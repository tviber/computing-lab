import {
  GATE_LABEL,
  type CircuitEdge,
  type CircuitGraph,
  type CircuitNode,
  type ComponentDef,
  type PortRef,
} from "./graph.ts";

const IDENTIFIER_PATTERN = /^[\p{L}_][\p{L}\p{N}_-]{0,31}$/u;

export type ComponentInputBoundary = {
  key: string;
  defaultName: string;
  external: PortRef;
  internal: PortRef[];
  externalLabel: string;
  internalLabels: string[];
};

export type ComponentOutputBoundary = {
  key: string;
  defaultName: string;
  internal: PortRef;
  external: PortRef[];
  internalLabel: string;
  externalLabels: string[];
};

export type ComponentSelection = {
  selectedIds: string[];
  inputPorts: ComponentInputBoundary[];
  outputPorts: ComponentOutputBoundary[];
  error: string | null;
};

export type ComponentizeRequest = {
  graph: CircuitGraph;
  selectedIds: string[];
  name: string;
  inputNames: string[];
  outputNames: string[];
  /** Boundary keys in the user-selected visual order. */
  inputPortKeys?: string[];
  outputPortKeys?: string[];
  componentNodeId: string;
  edgeIdPrefix: string;
};

export type ComponentizeResult =
  { component: ComponentDef; graph: CircuitGraph } | { error: string };

export type ComponentPortEditRequest = {
  component: ComponentDef;
  inputNames: string[];
  outputNames: string[];
  inputPortKeys?: string[];
  outputPortKeys?: string[];
};

export type ComponentPortEditResult =
  | {
      component: ComponentDef;
      inputPortRenames: Record<string, string>;
      outputPortRenames: Record<string, string>;
    }
  | { error: string };

export type ExpandComponentRequest = {
  graph: CircuitGraph;
  componentNodeId: string;
  component: ComponentDef;
  edgeIdPrefix: string;
};

export type ExpandComponentResult = { graph: CircuitGraph } | { error: string };

export function isValidComponentIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value.trim());
}

function portKey(ref: PortRef): string {
  return `${ref.node}#${ref.port}`;
}

function nodeLabel(node: CircuitNode): string {
  if (node.kind === "input" || node.kind === "output") return node.name ?? node.id;
  if (node.kind === "const") return `常量 ${node.value ?? 0}`;
  if (node.kind === "component") return node.name ?? node.id;
  return `${GATE_LABEL[node.kind] ?? node.kind}（${node.id}）`;
}

function portLabel(nodesById: Map<string, CircuitNode>, ref: PortRef): string {
  const node = nodesById.get(ref.node);
  return `${node ? nodeLabel(node) : ref.node} 的 ${ref.port}`;
}

function compareBoundaryPosition(
  left: { internal: PortRef | PortRef[] },
  right: { internal: PortRef | PortRef[] },
  nodesById: Map<string, CircuitNode>,
): number {
  const leftInternal = Array.isArray(left.internal) ? left.internal[0] : left.internal;
  const rightInternal = Array.isArray(right.internal) ? right.internal[0] : right.internal;
  const leftNode = nodesById.get(leftInternal?.node ?? "");
  const rightNode = nodesById.get(rightInternal?.node ?? "");
  if (!leftNode || !rightNode) return 0;
  return (
    leftNode.y - rightNode.y ||
    leftNode.x - rightNode.x ||
    (leftInternal?.port ?? "").localeCompare(rightInternal?.port ?? "")
  );
}

/**
 * Find the public ports created by a selection's crossing wires. The selected
 * nodes themselves become the inner circuit; every wire entering or leaving
 * that set becomes one component port.
 */
export function inspectComponentSelection(
  graph: CircuitGraph,
  selectedIds: string[],
): ComponentSelection {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const selected = new Set(selectedIds.filter((id) => nodeIds.has(id)));
  const selectedNodes = graph.nodes.filter((node) => selected.has(node.id));

  if (selectedNodes.length === 0) {
    return {
      selectedIds: [],
      inputPorts: [],
      outputPorts: [],
      error: "请先在画布上框选要封装的元件。",
    };
  }
  if (selectedNodes.some((node) => node.kind === "input" || node.kind === "output")) {
    return {
      selectedIds: [...selected],
      inputPorts: [],
      outputPorts: [],
      error: "关卡的输入/输出引脚不能封装，请只框选逻辑门、常量或已有组件。",
    };
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const inputMap = new Map<string, ComponentInputBoundary>();
  const outputMap = new Map<string, ComponentOutputBoundary>();

  for (const edge of graph.edges) {
    const fromSelected = selected.has(edge.from.node);
    const toSelected = selected.has(edge.to.node);
    if (!fromSelected && toSelected) {
      const key = portKey(edge.from);
      const boundary = inputMap.get(key);
      if (boundary) {
        if (!boundary.internal.some((target) => portKey(target) === portKey(edge.to))) {
          boundary.internal.push(edge.to);
          boundary.internalLabels.push(portLabel(nodesById, edge.to));
        }
      } else {
        inputMap.set(key, {
          key,
          defaultName: `I${inputMap.size}`,
          external: edge.from,
          internal: [edge.to],
          externalLabel: portLabel(nodesById, edge.from),
          internalLabels: [portLabel(nodesById, edge.to)],
        });
      }
    } else if (fromSelected && !toSelected) {
      const key = portKey(edge.from);
      const boundary = outputMap.get(key);
      if (boundary) {
        boundary.external.push(edge.to);
        boundary.externalLabels.push(portLabel(nodesById, edge.to));
      } else {
        outputMap.set(key, {
          key,
          defaultName: `O${outputMap.size}`,
          internal: edge.from,
          external: [edge.to],
          internalLabel: portLabel(nodesById, edge.from),
          externalLabels: [portLabel(nodesById, edge.to)],
        });
      }
    }
  }

  const inputPorts = [...inputMap.values()].sort((left, right) =>
    compareBoundaryPosition(left, right, nodesById),
  );
  const outputPorts = [...outputMap.values()].sort((left, right) =>
    compareBoundaryPosition(left, right, nodesById),
  );

  // Assign defaults after sorting so the visible order and port suffixes agree.
  inputPorts.forEach((port, index) => {
    port.defaultName = `I${index}`;
  });
  outputPorts.forEach((port, index) => {
    port.defaultName = `O${index}`;
  });

  return {
    selectedIds: [...selected],
    inputPorts,
    outputPorts,
    error:
      inputPorts.length === 0 && outputPorts.length === 0
        ? "选区没有与画布其它部分相连的连线，暂时无法生成可用组件。"
        : null,
  };
}

function validPortNames(names: string[], kind: "入口" | "出口"): string | null {
  if (names.some((name) => !isValidComponentIdentifier(name))) {
    return `${kind}名称只能使用字母、数字、下划线或连字符，且需以字母或下划线开头。`;
  }
  if (new Set(names).size !== names.length) return `${kind}名称不能重复。`;
  return null;
}

function reorderBoundaries<T extends { key: string }>(
  boundaries: T[],
  keys: string[] | undefined,
): T[] | null {
  if (keys === undefined) return boundaries;
  if (keys.length !== boundaries.length || new Set(keys).size !== keys.length) return null;
  const byKey = new Map(boundaries.map((boundary) => [boundary.key, boundary]));
  const ordered = keys.map((key) => byKey.get(key));
  return ordered.every((boundary): boundary is T => Boolean(boundary)) ? ordered : null;
}

function reorderPortNodes(nodes: CircuitNode[], keys: string[] | undefined): CircuitNode[] | null {
  if (keys === undefined) return nodes;
  if (keys.length !== nodes.length || new Set(keys).size !== keys.length) return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered = keys.map((key) => byId.get(key));
  return ordered.every((node): node is CircuitNode => Boolean(node)) ? ordered : null;
}

/** Update a custom component's public port names and ordering without changing its logic. */
export function editComponentPorts(request: ComponentPortEditRequest): ComponentPortEditResult {
  const inputNodes = request.component.graph.nodes.filter(
    (node) => node.kind === "input" && node.name,
  );
  const outputNodes = request.component.graph.nodes.filter(
    (node) => node.kind === "output" && node.name,
  );
  const orderedInputs = reorderPortNodes(inputNodes, request.inputPortKeys);
  const orderedOutputs = reorderPortNodes(outputNodes, request.outputPortKeys);
  if (!orderedInputs || !orderedOutputs) {
    return { error: "端口顺序已变化，请重新打开编辑面板。" };
  }

  const inputNames = request.inputNames.map((name) => name.trim());
  const outputNames = request.outputNames.map((name) => name.trim());
  if (inputNames.length !== orderedInputs.length || outputNames.length !== orderedOutputs.length) {
    return { error: "端口数量已变化，请重新打开编辑面板。" };
  }
  const inputError = validPortNames(inputNames, "入口");
  if (inputError) return { error: inputError };
  const outputError = validPortNames(outputNames, "出口");
  if (outputError) return { error: outputError };
  if (new Set([...inputNames, ...outputNames]).size !== inputNames.length + outputNames.length) {
    return { error: "入口和出口名称不能相同。" };
  }

  const inputPortRenames = Object.fromEntries(
    orderedInputs.map((node, index) => [node.name as string, inputNames[index]]),
  );
  const outputPortRenames = Object.fromEntries(
    orderedOutputs.map((node, index) => [node.name as string, outputNames[index]]),
  );
  const inputIds = new Set(inputNodes.map((node) => node.id));
  const outputIds = new Set(outputNodes.map((node) => node.id));
  const innerNodes = request.component.graph.nodes.filter(
    (node) => !inputIds.has(node.id) && !outputIds.has(node.id),
  );
  const graph: CircuitGraph = {
    ...request.component.graph,
    nodes: [
      ...orderedInputs.map((node, index) => ({ ...node, name: inputNames[index] })),
      ...innerNodes,
      ...orderedOutputs.map((node, index) => ({ ...node, name: outputNames[index] })),
    ],
  };
  return {
    component: { ...request.component, graph },
    inputPortRenames,
    outputPortRenames,
  };
}

function cloneInnerNode(node: CircuitNode, id: string, minX: number, minY: number): CircuitNode {
  return {
    ...node,
    id,
    x: Math.max(180, Math.round(node.x - minX + 180)),
    y: Math.max(32, Math.round(node.y - minY + 32)),
  };
}

/** Replace the selected subgraph with a reusable black-box component. */
export function componentizeSelection(request: ComponentizeRequest): ComponentizeResult {
  const selection = inspectComponentSelection(request.graph, request.selectedIds);
  if (selection.error) return { error: selection.error };

  const inputPorts = reorderBoundaries(selection.inputPorts, request.inputPortKeys);
  const outputPorts = reorderBoundaries(selection.outputPorts, request.outputPortKeys);
  if (!inputPorts || !outputPorts) {
    return { error: "端口顺序已变化，请重新打开封装面板。" };
  }
  const orderedSelection = { ...selection, inputPorts, outputPorts };

  const name = request.name.trim();
  const inputNames = request.inputNames.map((value) => value.trim());
  const outputNames = request.outputNames.map((value) => value.trim());
  if (!isValidComponentIdentifier(name)) {
    return { error: "组件名称不能为空，只能使用字母、数字、下划线或连字符。" };
  }
  if (inputNames.length !== orderedSelection.inputPorts.length) {
    return { error: "入口数量已变化，请重新打开封装面板。" };
  }
  if (outputNames.length !== orderedSelection.outputPorts.length) {
    return { error: "出口数量已变化，请重新打开封装面板。" };
  }
  const inputError = validPortNames(inputNames, "入口");
  if (inputError) return { error: inputError };
  const outputError = validPortNames(outputNames, "出口");
  if (outputError) return { error: outputError };
  if (new Set([...inputNames, ...outputNames]).size !== inputNames.length + outputNames.length) {
    return { error: "入口和出口名称不能相同。" };
  }
  if (!request.componentNodeId || !request.edgeIdPrefix) {
    return { error: "组件标识生成失败，请重试。" };
  }

  const selected = new Set(orderedSelection.selectedIds);
  const selectedNodes = request.graph.nodes.filter((node) => selected.has(node.id));
  const nodesById = new Map(request.graph.nodes.map((node) => [node.id, node]));
  const minX = Math.min(...selectedNodes.map((node) => node.x));
  const minY = Math.min(...selectedNodes.map((node) => node.y));
  const innerId = (id: string) => `${request.componentNodeId}-inner-${id}`;
  const inputId = (index: number) => `${request.componentNodeId}-input-${index}`;
  const outputId = (index: number) => `${request.componentNodeId}-output-${index}`;

  const inputNodes: CircuitNode[] = orderedSelection.inputPorts.map((_, index) => ({
    id: inputId(index),
    kind: "input",
    name: inputNames[index],
    value: 0,
    x: 40,
    y: 40 + index * 46,
  }));
  const innerNodes = selectedNodes.map((node) =>
    cloneInnerNode(node, innerId(node.id), minX, minY),
  );
  const maxInnerX = Math.max(...innerNodes.map((node) => node.x), 180);
  const outputNodes: CircuitNode[] = orderedSelection.outputPorts.map((_, index) => ({
    id: outputId(index),
    kind: "output",
    name: outputNames[index],
    x: maxInnerX + 340,
    y: 40 + index * 46,
  }));

  const innerEdges: CircuitEdge[] = [];
  for (const edge of request.graph.edges) {
    const fromSelected = selected.has(edge.from.node);
    const toSelected = selected.has(edge.to.node);
    if (fromSelected && toSelected) {
      innerEdges.push({
        id: `${request.edgeIdPrefix}-inner-${innerEdges.length}`,
        from: { node: innerId(edge.from.node), port: edge.from.port },
        to: { node: innerId(edge.to.node), port: edge.to.port },
      });
    } else if (!fromSelected && toSelected) {
      const index = orderedSelection.inputPorts.findIndex(
        (port) => port.key === portKey(edge.from),
      );
      if (index >= 0) {
        const alreadyConnected = innerEdges.some(
          (innerEdge) =>
            innerEdge.to.node === innerId(edge.to.node) && innerEdge.to.port === edge.to.port,
        );
        if (!alreadyConnected) {
          innerEdges.push({
            id: `${request.edgeIdPrefix}-inner-${innerEdges.length}`,
            from: { node: inputId(index), port: "out" },
            to: { node: innerId(edge.to.node), port: edge.to.port },
          });
        }
      }
    } else if (fromSelected && !toSelected) {
      const index = orderedSelection.outputPorts.findIndex(
        (port) => port.key === portKey(edge.from),
      );
      if (index >= 0) {
        const alreadyConnected = innerEdges.some(
          (innerEdge) =>
            innerEdge.from.node === innerId(edge.from.node) &&
            innerEdge.from.port === edge.from.port,
        );
        if (!alreadyConnected) {
          innerEdges.push({
            id: `${request.edgeIdPrefix}-inner-${innerEdges.length}`,
            from: { node: innerId(edge.from.node), port: edge.from.port },
            to: { node: outputId(index), port: "in" },
          });
        }
      }
    }
  }

  const innerGraph: CircuitGraph = {
    nodes: [...inputNodes, ...innerNodes, ...outputNodes],
    edges: innerEdges,
  };
  const component: ComponentDef = { name, graph: innerGraph, custom: true };
  const outerEdges: CircuitEdge[] = [];

  for (const edge of request.graph.edges) {
    const fromSelected = selected.has(edge.from.node);
    const toSelected = selected.has(edge.to.node);
    if (!fromSelected && !toSelected) {
      outerEdges.push(edge);
    }
  }

  orderedSelection.inputPorts.forEach((port, index) => {
    outerEdges.push({
      id: `${request.edgeIdPrefix}-input-${index}`,
      from: port.external,
      to: { node: request.componentNodeId, port: inputNames[index] },
    });
  });
  orderedSelection.outputPorts.forEach((port, index) => {
    for (const target of port.external) {
      outerEdges.push({
        id: `${request.edgeIdPrefix}-output-${index}-${outerEdges.length}`,
        from: { node: request.componentNodeId, port: outputNames[index] },
        to: target,
      });
    }
  });

  const outerGraph: CircuitGraph = {
    nodes: [
      ...request.graph.nodes.filter((node) => !selected.has(node.id)),
      {
        id: request.componentNodeId,
        kind: "component",
        name,
        x: Math.round(minX),
        y: Math.round(minY),
      },
    ],
    edges: outerEdges,
  };

  // Keep this lookup here so malformed graphs cannot create a component with
  // boundary references to a node that was not in the original graph.
  if (selection.inputPorts.some((port) => !nodesById.has(port.external.node))) {
    return { error: "选区边界包含无效连线，请撤销后重试。" };
  }
  return { component, graph: outerGraph };
}

/** Expand one custom black-box instance back into its editable inner nodes. */
export function expandComponentNode(request: ExpandComponentRequest): ExpandComponentResult {
  const componentNode = request.graph.nodes.find((node) => node.id === request.componentNodeId);
  if (!componentNode || componentNode.kind !== "component") {
    return { error: "请先选中画布中的自定义组件。" };
  }
  if (!request.component.custom) return { error: "只有自定义组件可以拆分回去。" };

  const innerGraph = request.component.graph;
  const inputNodes = new Map(
    innerGraph.nodes
      .filter((node) => node.kind === "input" && node.name)
      .map((node) => [node.name as string, node]),
  );
  const outputNodes = new Map(
    innerGraph.nodes
      .filter((node) => node.kind === "output" && node.name)
      .map((node) => [node.name as string, node]),
  );
  const boundaryIds = new Set([...inputNodes.values(), ...outputNodes.values()].map((n) => n.id));
  const innerNodes = innerGraph.nodes.filter((node) => !boundaryIds.has(node.id));
  const clonedId = (id: string) => `${request.edgeIdPrefix}-node-${id}`;
  const cloneNode = (node: CircuitNode): CircuitNode => ({
    ...node,
    id: clonedId(node.id),
    x: Math.max(0, Math.round(componentNode.x + node.x - 180)),
    y: Math.max(0, Math.round(componentNode.y + node.y - 32)),
  });
  const clonedNodeIds = new Set(innerNodes.map((node) => clonedId(node.id)));
  const incoming = request.graph.edges.filter((edge) => edge.to.node === componentNode.id);
  const outgoing = request.graph.edges.filter((edge) => edge.from.node === componentNode.id);
  const edges: CircuitEdge[] = request.graph.edges.filter(
    (edge) => edge.from.node !== componentNode.id && edge.to.node !== componentNode.id,
  );
  let edgeIndex = 0;
  const addEdge = (from: PortRef, to: PortRef) => {
    edges.push({ id: `${request.edgeIdPrefix}-${edgeIndex++}`, from, to });
  };

  for (const edge of innerGraph.edges) {
    const fromInput = [...inputNodes.values()].find((node) => node.id === edge.from.node);
    const toOutput = [...outputNodes.values()].find((node) => node.id === edge.to.node);
    if (fromInput && clonedNodeIds.has(clonedId(edge.to.node))) {
      for (const outerEdge of incoming.filter(
        (candidate) => candidate.to.port === fromInput.name,
      )) {
        addEdge(outerEdge.from, { node: clonedId(edge.to.node), port: edge.to.port });
      }
    } else if (toOutput && clonedNodeIds.has(clonedId(edge.from.node))) {
      for (const outerEdge of outgoing.filter(
        (candidate) => candidate.from.port === toOutput.name,
      )) {
        addEdge({ node: clonedId(edge.from.node), port: edge.from.port }, outerEdge.to);
      }
    } else if (
      clonedNodeIds.has(clonedId(edge.from.node)) &&
      clonedNodeIds.has(clonedId(edge.to.node))
    ) {
      addEdge(
        { node: clonedId(edge.from.node), port: edge.from.port },
        { node: clonedId(edge.to.node), port: edge.to.port },
      );
    }
  }

  return {
    graph: {
      nodes: [
        ...request.graph.nodes.filter((node) => node.id !== componentNode.id),
        ...innerNodes.map(cloneNode),
      ],
      edges,
    },
  };
}
