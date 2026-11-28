import { GATE_LABEL, type Bit, type CircuitNode } from "../domain/graph";
import { nodeSize } from "./geometry";
import type { ComponentCatalog } from "../lesson/state";
import { CALCULATOR_TERM_NOTES } from "./CalculatorTerms";

export const NODE_DRAG_THRESHOLD = 4;
export const MARQUEE_MIN_SIZE = 8;

export function nodeLabel(node: CircuitNode): string {
  if (node.kind === "input" || node.kind === "output") return node.name ?? "?";
  if (node.kind === "const") return String(node.value ?? 0);
  if (node.kind === "component") return node.name ?? "?";
  return GATE_LABEL[node.kind] ?? node.kind;
}

export function valueClass(value: Bit | null | undefined): string {
  if (value === 1) return " is-high";
  if (value === 0) return " is-low";
  return " is-floating";
}

export function nodeHelp(node: CircuitNode): string | null {
  const label = nodeLabel(node);
  return label in CALCULATOR_TERM_NOTES
    ? CALCULATOR_TERM_NOTES[label as keyof typeof CALCULATOR_TERM_NOTES]
    : null;
}

export function rectangleBetween(
  start: { x: number; y: number },
  current: { x: number; y: number },
) {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

export function marqueeSelection(
  nodes: readonly CircuitNode[],
  components: ComponentCatalog,
  rectangle: { x: number; y: number; width: number; height: number },
): string[] {
  if (rectangle.width < MARQUEE_MIN_SIZE || rectangle.height < MARQUEE_MIN_SIZE) return [];
  return nodes
    .filter((node) => {
      const size = nodeSize(node, components);
      return (
        node.x >= rectangle.x &&
        node.y >= rectangle.y &&
        node.x + size.width <= rectangle.x + rectangle.width &&
        node.y + size.height <= rectangle.y + rectangle.height
      );
    })
    .map((node) => node.id);
}
