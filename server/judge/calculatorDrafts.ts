import {
  gateInputPorts,
  gateOutputPorts,
  inputPinNames,
  outputPinNames,
  type CircuitGraph,
  type CircuitNode,
  type ComponentDef,
  type PortRef,
} from "../../src/features/calculator/domain/graph.ts";
import { CALCULATOR_STAGES } from "../../src/features/calculator/domain/stages.ts";
import type { ReconcileDrafts } from "./pipeline.ts";

export const reconcileCalculatorDrafts: ReconcileDrafts<CircuitGraph> = (
  drafts,
  library,
  originalLibrary,
) => {
  const known = new Set((library as ComponentDef[]).map((def) => def.name));
  const definitions = new Map(
    (originalLibrary as ComponentDef[]).map((def) => [def.name, def.graph]),
  );
  const cleaned = { ...drafts };
  const notices: string[] = [];
  for (const [stage, graph] of Object.entries(drafts)) {
    if (!Array.isArray(graph?.nodes) || !Array.isArray(graph.edges)) continue;
    const missing = graph.nodes.filter(
      (node) => node.kind === "component" && !known.has(node.name ?? ""),
    );
    if (!missing.length) continue;
    const affected = new Set(missing.map((node) => node.id));
    const used = new Set(graph.nodes.map((node) => node.id));

    const removed = new Set(missing);
    const groups = new Map<string, CircuitNode[]>();
    const keptIds = new Map<CircuitNode, string>();
    const assigned = new Set<string>();
    let next = 1;
    for (const node of graph.nodes) {
      const group = groups.get(node.id) ?? [];
      group.push(node);
      groups.set(node.id, group);
      if (removed.has(node)) continue;
      let id = node.id;
      if (affected.has(id) && assigned.has(id)) {
        do {
          id = `n${next++}`;
        } while (used.has(id));
        used.add(id);
      }
      assigned.add(id);
      keptIds.set(node, id);
    }

    let ambiguous = false;
    function endpoint(ref: PortRef, direction: "in" | "out"): PortRef | undefined {
      if (!affected.has(ref.node)) return ref;
      const group = groups.get(ref.node);
      if (!group) return ref;
      if (group.length === 1) return removed.has(group[0]) ? undefined : ref;
      const candidates = group.filter((node) => {
        if (node.kind !== "component")
          return (direction === "in" ? gateInputPorts(node) : gateOutputPorts(node)).includes(
            ref.port,
          );
        const def = definitions.get(node.name ?? "");
        if (def)
          return (direction === "in" ? inputPinNames(def) : outputPinNames(def)).includes(ref.port);
        const stage = CALCULATOR_STAGES.find((stage) => stage.unlocks === node.name);
        // A lost custom definition has no surviving port contract to rule it out.
        return !stage || (direction === "in" ? stage.inputs : stage.outputs).includes(ref.port);
      });
      if (candidates.length > 1 && candidates.some((node) => keptIds.has(node))) ambiguous = true;
      const id = candidates.length === 1 ? keptIds.get(candidates[0]) : undefined;
      return id === undefined ? undefined : { ...ref, node: id };
    }
    cleaned[stage] = {
      nodes: Array.from(keptIds, ([node, id]) => (node.id === id ? node : { ...node, id })),
      edges: graph.edges.flatMap((edge) => {
        const from = endpoint(edge.from, "out");
        const to = endpoint(edge.to, "in");
        return from && to ? [{ ...edge, from, to }] : [];
      }),
    };
    const names = [...new Set(missing.map((node) => node.name ?? "未命名组件"))].join("、");
    notices.push(`第 ${stage} 关草稿已移除失效组件 ${names} 及其连线。`);
    if (ambiguous) notices.push(`第 ${stage} 关有连线因旧编号重复而无法确定归属，请重新接线。`);
  }
  return { drafts: cleaned, notices };
};
