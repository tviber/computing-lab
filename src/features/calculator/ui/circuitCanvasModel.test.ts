import { describe, expect, it } from "vitest";
import type { CircuitNode } from "../domain/graph";
import { marqueeSelection, nodeLabel, rectangleBetween, valueClass } from "./circuitCanvasModel";

const node = (overrides: Partial<CircuitNode>): CircuitNode =>
  ({
    id: "n1",
    kind: "and",
    x: 10,
    y: 20,
    ...overrides,
  }) as CircuitNode;

describe("circuit canvas model", () => {
  it("labels pins, constants, components and built-in gates", () => {
    expect(nodeLabel(node({ kind: "input", name: "A" }))).toBe("A");
    expect(nodeLabel(node({ kind: "const", value: 1 }))).toBe("1");
    expect(nodeLabel(node({ kind: "component", name: "HalfAdder" }))).toBe("HalfAdder");
    expect(nodeLabel(node({ kind: "and" }))).toBe("AND");
  });

  it("maps tri-state values to the existing CSS classes", () => {
    expect(valueClass(1)).toBe(" is-high");
    expect(valueClass(0)).toBe(" is-low");
    expect(valueClass(null)).toBe(" is-floating");
  });

  it("normalizes a drag rectangle regardless of direction", () => {
    expect(rectangleBetween({ x: 30, y: 40 }, { x: 10, y: 60 })).toEqual({
      x: 10,
      y: 40,
      width: 20,
      height: 20,
    });
  });

  it("selects only nodes fully inside a usable marquee", () => {
    const components = {};
    const nodes = [node({ id: "inside", x: 100, y: 100 }), node({ id: "outside", x: 400, y: 400 })];
    expect(marqueeSelection(nodes, components, { x: 90, y: 90, width: 200, height: 150 })).toEqual([
      "inside",
    ]);
    expect(marqueeSelection(nodes, components, { x: 0, y: 0, width: 4, height: 100 })).toEqual([]);
  });
});
