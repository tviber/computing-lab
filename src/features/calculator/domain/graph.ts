/**
 * Circuit graph model — the "code" of the Calculator Lab.
 * Pure data + validation. No React, no DOM.
 *
 * A graph is a set of typed nodes with named ports, connected by directed edges.
 * Primitive gates have fixed ports; `input`/`output` nodes expose the public
 * contract of the stage (their `name` is the pin name a judge binds to).
 * `component` nodes reference a previously unlocked black-box graph by `ref`.
 */

export type Bit = 0 | 1;

export type GateKind = "and" | "or" | "xor" | "nand" | "nor" | "not" | "buffer";

export type NodeKind = "input" | "output" | "const" | "component" | GateKind;

export type PortRef = { node: string; port: string };

export type CircuitNode = {
  id: string;
  kind: NodeKind;
  /** Pin name for input/output nodes; component name for component nodes. */
  name?: string;
  /** Manual value for input nodes and const nodes. */
  value?: Bit;
  /** Whether a component instance hides every wire connected to it on the canvas. */
  collapsed?: boolean;
  x: number;
  y: number;
};

export type CircuitEdge = { id: string; from: PortRef; to: PortRef };

export type CircuitGraph = { nodes: CircuitNode[]; edges: CircuitEdge[] };

/** A reusable black-box component, either unlocked by a stage or made by a learner. */
export type ComponentDef = { name: string; graph: CircuitGraph; custom?: boolean };

export const GATE_INPUT_PORTS: Record<GateKind, string[]> = {
  and: ["in0", "in1"],
  or: ["in0", "in1"],
  xor: ["in0", "in1"],
  nand: ["in0", "in1"],
  nor: ["in0", "in1"],
  not: ["in"],
  buffer: ["in"],
};

export const GATE_OUTPUT_PORTS: Record<GateKind, string[]> = {
  and: ["out"],
  or: ["out"],
  xor: ["out"],
  nand: ["out"],
  nor: ["out"],
  not: ["out"],
  buffer: ["out"],
};

export const GATE_LABEL: Record<GateKind, string> = {
  and: "AND",
  or: "OR",
  xor: "XOR",
  nand: "NAND",
  nor: "NOR",
  not: "NOT",
  buffer: "BUF",
};

function isGateKind(value: unknown): value is GateKind {
  return typeof value === "string" && Object.hasOwn(GATE_INPUT_PORTS, value);
}

function isNodeKind(value: unknown): value is NodeKind {
  return (
    value === "input" ||
    value === "output" ||
    value === "const" ||
    value === "component" ||
    isGateKind(value)
  );
}

export function gateInputPorts(node: CircuitNode): string[] {
  if (node.kind === "output") return ["in"];
  if (isGateKind(node.kind)) return GATE_INPUT_PORTS[node.kind];
  return [];
}

export function gateOutputPorts(node: CircuitNode): string[] {
  if (node.kind === "input" || node.kind === "const") return ["out"];
  if (isGateKind(node.kind)) return GATE_OUTPUT_PORTS[node.kind];
  return [];
}

export function emptyGraph(): CircuitGraph {
  return { nodes: [], edges: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Only the container is checked here; individual entries remain untrusted. */
export function isGraph(value: unknown): value is { nodes: unknown[]; edges: unknown[] } {
  return isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges);
}

function isPortRef(value: unknown): value is PortRef {
  return isRecord(value) && typeof value.node === "string" && typeof value.port === "string";
}

/** Port tables are closed for every kind except `component` (catalog-defined). */
function portExists(node: CircuitNode | undefined, ref: PortRef, direction: "in" | "out"): boolean {
  if (!node || node.kind === "component") return Boolean(node);
  const ports = direction === "in" ? gateInputPorts(node) : gateOutputPorts(node);
  return ports.includes(ref.port);
}

export function sanitizeGraph(value: unknown): CircuitGraph {
  if (!isGraph(value)) return emptyGraph();
  const nodes = value.nodes.flatMap((n): CircuitNode[] => {
    if (
      !isRecord(n) ||
      typeof n.id !== "string" ||
      !isNodeKind(n.kind) ||
      typeof n.x !== "number" ||
      typeof n.y !== "number" ||
      !Number.isFinite(n.x) ||
      !Number.isFinite(n.y)
    ) {
      return [];
    }
    return [
      {
        id: n.id,
        kind: n.kind,
        name: typeof n.name === "string" ? n.name : undefined,
        value: n.value === 1 ? 1 : n.value === 0 ? 0 : undefined,
        collapsed: n.collapsed === true ? true : undefined,
        x: Math.round(n.x),
        y: Math.round(n.y),
      },
    ];
  });
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const edges: CircuitEdge[] = [];
  // One driver per input port, same rule the wiring reducer enforces: when a
  // stored or imported graph carries several edges into one `to` port, the
  // last edge wins and the rest are dropped. Edges pointing at a node or a
  // known-missing port are dangling and dropped too.
  const driven = new Set<string>();
  for (const raw of value.edges) {
    if (
      !isRecord(raw) ||
      typeof raw.id !== "string" ||
      !isPortRef(raw.from) ||
      !isPortRef(raw.to)
    ) {
      continue;
    }
    const fromNode = nodesById.get(raw.from.node);
    const toNode = nodesById.get(raw.to.node);
    const toPort = { node: raw.to.node, port: raw.to.port };
    const fromPort = { node: raw.from.node, port: raw.from.port };
    if (!fromNode || !toNode) continue;
    if (!portExists(fromNode, fromPort, "out") || !portExists(toNode, toPort, "in")) continue;
    const toKey = `${toPort.node}#${toPort.port}`;
    if (driven.has(toKey)) {
      const index = edges.findIndex(
        (candidate) => candidate.to.node === toPort.node && candidate.to.port === toPort.port,
      );
      if (index >= 0) edges.splice(index, 1);
    }
    driven.add(toKey);
    edges.push({ id: raw.id, from: fromPort, to: toPort });
  }
  return { nodes, edges };
}

/** Named pins of a graph, used as its black-box contract. */
export function inputPinNames(graph: CircuitGraph): string[] {
  return graph.nodes
    .filter((n) => n.kind === "input")
    .map((n) => n.name ?? "")
    .filter(Boolean);
}

export function outputPinNames(graph: CircuitGraph): string[] {
  return graph.nodes
    .filter((n) => n.kind === "output")
    .map((n) => n.name ?? "")
    .filter(Boolean);
}

/**
 * Structural contract check run before any truth-table judging. A graph that
 * fails here is judged as failed without running cases — the issue strings
 * are learner-facing diagnostics, not internals.
 *
 * Checks: no duplicated pin names, at most one driver per input port, every
 * required input pin exists and feeds something, and every required output
 * pin exists and is driven.
 */
export function findContractIssues(
  graph: CircuitGraph,
  requiredInputs: readonly string[],
  requiredOutputs: readonly string[],
): string[] {
  const issues: string[] = [];

  const duplicates = (kind: "input" | "output"): string[] => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const node of graph.nodes) {
      if (node.kind !== kind || !node.name) continue;
      if (seen.has(node.name)) dup.add(node.name);
      seen.add(node.name);
    }
    return [...dup];
  };
  for (const name of duplicates("input")) issues.push(`输入引脚 ${name} 重复了`);
  for (const name of duplicates("output")) issues.push(`输出引脚 ${name} 重复了`);

  const labelOf = (nodeId: string, port: string): string => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    const name = node?.name ?? nodeId;
    return `${name} 的 ${port} 口`;
  };
  const driven = new Set<string>();
  for (const edge of graph.edges) {
    const key = `${edge.to.node}#${edge.to.port}`;
    if (driven.has(key)) issues.push(`${labelOf(edge.to.node, edge.to.port)}接入了多根导线`);
    driven.add(key);
  }

  const inputsByName = new Map(
    graph.nodes.filter((n) => n.kind === "input" && n.name).map((n) => [n.name as string, n]),
  );
  const outputsByName = new Map(
    graph.nodes.filter((n) => n.kind === "output" && n.name).map((n) => [n.name as string, n]),
  );
  for (const pin of requiredInputs) {
    const node = inputsByName.get(pin);
    if (!node) {
      issues.push(`缺少输入引脚 ${pin}`);
      continue;
    }
    if (!graph.edges.some((edge) => edge.from.node === node.id)) {
      issues.push(`输入 ${pin} 没有接出导线`);
    }
  }
  for (const pin of requiredOutputs) {
    const node = outputsByName.get(pin);
    if (!node) {
      issues.push(`缺少输出引脚 ${pin}`);
      continue;
    }
    if (!graph.edges.some((edge) => edge.to.node === node.id && edge.to.port === "in")) {
      issues.push(`输出 ${pin} 没有被驱动`);
    }
  }
  return issues;
}
