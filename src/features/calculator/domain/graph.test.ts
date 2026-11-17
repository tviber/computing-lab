import { describe, expect, it } from "vitest";
import { findContractIssues, sanitizeGraph, type CircuitGraph } from "./graph.ts";

const nodes = [
  { id: "a", kind: "input", name: "A", value: 0, x: 0, y: 0 },
  { id: "b", kind: "input", name: "B", value: 0, x: 0, y: 40 },
  { id: "g", kind: "xor", x: 100, y: 0 },
  { id: "s", kind: "output", name: "Sum", x: 200, y: 0 },
] satisfies CircuitGraph["nodes"];

describe("sanitizeGraph", () => {
  it.each([null, undefined, false, 0, "graph", [], {}, { nodes: [], edges: null }])(
    "returns an empty graph for an invalid container: %j",
    (raw) => {
      expect(sanitizeGraph(raw)).toEqual({ nodes: [], edges: [] });
    },
  );

  it("rejects unknown and inherited node kinds and non-finite coordinates", () => {
    const rejected: unknown[] = ["unknown", "toString", "__proto__", "constructor", null, 0].map(
      (kind) => ({ ...nodes[0], kind }),
    );
    const coordinates = [NaN, Infinity, -Infinity, "0", null, undefined];
    for (const coordinate of coordinates) {
      rejected.push({ ...nodes[0], x: coordinate }, { ...nodes[0], y: coordinate });
    }
    expect(sanitizeGraph({ nodes: rejected, edges: [] }).nodes).toEqual([]);
  });

  it("accepts every supported node kind and rounds coordinates", () => {
    const kinds = [
      "input",
      "output",
      "const",
      "component",
      "and",
      "or",
      "xor",
      "nand",
      "nor",
      "not",
      "buffer",
    ];
    const rawNodes = kinds.map((kind, id) => ({ id: String(id), kind, x: 1.7, y: -2.2 }));
    const graph = sanitizeGraph({ nodes: rawNodes, edges: [] });
    expect(graph.nodes.map((node) => node.kind)).toEqual(kinds);
    expect(graph.nodes.every((node) => node.x === 2 && node.y === -2)).toBe(true);
    expect(sanitizeGraph(graph)).toEqual(graph);
  });

  it("drops malformed edge endpoints instead of coercing them into ports", () => {
    const malformed = [
      null,
      0,
      "a",
      [],
      {},
      { node: "a" },
      { node: 0, port: "out" },
      { node: "a", port: 0 },
    ];
    for (const endpoint of malformed) {
      const graph = sanitizeGraph({
        nodes,
        edges: [
          { id: "from", from: endpoint, to: { node: "g", port: "in0" } },
          { id: "to", from: { node: "a", port: "out" }, to: endpoint },
        ],
      });
      expect(graph.edges).toEqual([]);
    }
  });

  it("drops every edge into an already-driven input port, keeping the last", () => {
    const graph = sanitizeGraph({
      nodes,
      edges: [
        { id: "e1", from: { node: "a", port: "out" }, to: { node: "g", port: "in0" } },
        { id: "e2", from: { node: "b", port: "out" }, to: { node: "g", port: "in0" } },
      ],
    });
    // The second edge rewires in0 from A to B — the same "last wins" semantics
    // the wiring reducer enforces on the canvas.
    expect(graph.edges).toEqual([
      { id: "e2", from: { node: "b", port: "out" }, to: { node: "g", port: "in0" } },
    ]);
  });

  it("drops edges pointing at missing nodes or missing ports", () => {
    const graph = sanitizeGraph({
      nodes,
      edges: [
        { id: "e1", from: { node: "a", port: "out" }, to: { node: "ghost", port: "in0" } },
        { id: "e2", from: { node: "a", port: "out" }, to: { node: "g", port: "in9" } },
        { id: "e3", from: { node: "a", port: "out" }, to: { node: "g", port: "in0" } },
      ],
    });
    expect(graph.edges.map((edge) => edge.id)).toEqual(["e3"]);
  });
});

describe("findContractIssues", () => {
  it("flags a port driven by two wires", () => {
    const graph: CircuitGraph = {
      nodes,
      edges: [
        { id: "e1", from: { node: "a", port: "out" }, to: { node: "g", port: "in0" } },
        { id: "e2", from: { node: "b", port: "out" }, to: { node: "g", port: "in0" } },
      ],
    };
    const issues = findContractIssues(graph, ["A", "B"], ["Sum"]);
    expect(issues.some((issue) => issue.includes("多根导线"))).toBe(true);
  });

  it("flags missing and undriven contract pins", () => {
    const graph: CircuitGraph = {
      nodes: [
        { id: "a", kind: "input", name: "A", value: 0, x: 0, y: 0 },
        { id: "s", kind: "output", name: "Sum", x: 200, y: 0 },
      ],
      edges: [],
    };
    const issues = findContractIssues(graph, ["A", "B"], ["Sum", "Carry"]);
    expect(issues).toEqual([
      "输入 A 没有接出导线",
      "缺少输入引脚 B",
      "输出 Sum 没有被驱动",
      "缺少输出引脚 Carry",
    ]);
  });

  it("accepts a graph that satisfies the contract", () => {
    const graph = sanitizeGraph({
      nodes,
      edges: [
        { id: "e1", from: { node: "a", port: "out" }, to: { node: "g", port: "in0" } },
        { id: "e2", from: { node: "b", port: "out" }, to: { node: "g", port: "in1" } },
        { id: "e3", from: { node: "g", port: "out" }, to: { node: "s", port: "in" } },
      ],
    });
    expect(findContractIssues(graph, ["A", "B"], ["Sum"])).toEqual([]);
  });
});
