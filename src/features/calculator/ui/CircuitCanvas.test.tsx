import { fireEvent, render, screen } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { halfAdderGraph } from "../domain/fixtures";
import type { CircuitGraph } from "../domain/graph";
import { CircuitCanvas } from "./CircuitCanvas";
import { COLLAPSED_NODE_HEIGHT } from "./geometry";

const componentGraph: CircuitGraph = {
  nodes: [{ id: "half-adder", kind: "component", name: "HalfAdder", x: 120, y: 80 }],
  edges: [],
};

const numericComponentGraph: CircuitGraph = {
  nodes: [{ id: "add4", kind: "component", name: "Add4", x: 120, y: 80 }],
  edges: [],
};

const legacyAdd4Graph: CircuitGraph = {
  nodes: [
    { id: "s3", kind: "output", name: "S3", x: 720, y: 40 },
    { id: "s2", kind: "output", name: "S2", x: 720, y: 86 },
    { id: "s1", kind: "output", name: "S1", x: 720, y: 132 },
    { id: "s0", kind: "output", name: "S0", x: 720, y: 178 },
    { id: "cout", kind: "output", name: "Cout", x: 720, y: 224 },
  ],
  edges: [],
};

describe("CircuitCanvas", () => {
  it("labels component output ports at the exit side", () => {
    render(() => (
      <CircuitCanvas
        components={{ HalfAdder: halfAdderGraph() }}
        dispatch={vi.fn()}
        graph={componentGraph}
        pendingWire={null}
        portValues={{}}
        selectedNodeId={null}
      />
    ));

    expect(screen.getByText("Sum", { selector: ".port-label.is-out" })).toBeInTheDocument();
    expect(screen.getByText("Carry", { selector: ".port-label.is-out" })).toBeInTheDocument();
  });

  it("orders numbered component output ports from low bit to high bit", () => {
    render(() => (
      <CircuitCanvas
        components={{ Add4: legacyAdd4Graph }}
        dispatch={vi.fn()}
        graph={numericComponentGraph}
        pendingWire={null}
        portValues={{}}
        selectedNodeId={null}
      />
    ));

    expect(
      screen
        .getAllByText(/^(S[0-3]|Cout)$/, { selector: ".port-label.is-out" })
        .map((node) => node.textContent),
    ).toEqual(["S0", "S1", "S2", "S3", "Cout"]);
  });

  it("hides every wire connected to a collapsed component", () => {
    const dispatch = vi.fn();
    const { container } = render(() => (
      <CircuitCanvas
        components={{ HalfAdder: halfAdderGraph() }}
        dispatch={dispatch}
        graph={{
          nodes: [
            {
              id: "half-adder",
              kind: "component",
              name: "HalfAdder",
              collapsed: true,
              x: 120,
              y: 80,
            },
            { id: "out", kind: "output", name: "Sum", x: 420, y: 80 },
            { id: "source", kind: "input", name: "A", value: 1, x: 20, y: 250 },
            { id: "other-out", kind: "output", name: "Other", x: 420, y: 250 },
          ],
          edges: [
            {
              id: "hidden",
              from: { node: "half-adder", port: "Sum" },
              to: { node: "out", port: "in" },
            },
            {
              id: "visible",
              from: { node: "source", port: "out" },
              to: { node: "other-out", port: "in" },
            },
          ],
        }}
        pendingWire={null}
        portValues={{}}
        selectedNodeId={null}
      />
    ));

    expect(screen.getAllByRole("button", { name: /连线/ })).toHaveLength(1);
    const toggle = screen.getByRole("button", { name: "展开组件 HalfAdder", expanded: false });
    expect(screen.getByText("HalfAdder")).toBeInTheDocument();
    expect(container.querySelector(".circuit-node.is-collapsed .node-body")).toHaveAttribute(
      "height",
      String(COLLAPSED_NODE_HEIGHT),
    );
    expect(container.querySelectorAll(".circuit-node.is-collapsed .port")).toHaveLength(0);
    fireEvent.click(toggle);
    expect(dispatch).toHaveBeenCalledWith({ type: "toggle-collapse-node", id: "half-adder" });
  });

  it("supports undo and deleting the selected node from keyboard shortcuts", () => {
    const dispatch = vi.fn();
    render(() => (
      <CircuitCanvas
        components={{}}
        dispatch={dispatch}
        graph={{
          nodes: [{ id: "gate", kind: "not", x: 200, y: 40 }],
          edges: [],
        }}
        pendingWire={null}
        portValues={{}}
        selectedNodeId="gate"
      />
    ));
    flush();

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Delete" });

    expect(dispatch).toHaveBeenCalledWith({ type: "undo" });
    expect(dispatch).toHaveBeenCalledWith({ type: "delete-nodes", ids: ["gate"] });
  });

  it("does not toggle an input after dragging its node", () => {
    const dispatch = vi.fn();
    const graph: CircuitGraph = {
      nodes: [
        { id: "input", kind: "input", name: "A", value: 0, x: 40, y: 40 },
        { id: "output", kind: "output", name: "Y", x: 420, y: 40 },
      ],
      edges: [],
    };
    const { container } = render(() => (
      <CircuitCanvas
        components={{}}
        dispatch={dispatch}
        graph={graph}
        pendingWire={null}
        portValues={{}}
        selectedNodeId={null}
      />
    ));

    const input = screen.getByRole("button", { name: "切换 A，当前 0" });
    const canvas = screen.getByRole("application", { name: "电路画布" });
    fireEvent.pointerDown(input, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 90, pointerId: 1 });
    fireEvent.click(input);

    expect(dispatch).toHaveBeenCalledWith({ type: "move-node", id: "input", x: 110, y: 80 });
    expect(dispatch).toHaveBeenCalledWith({ type: "finish-node-move" });
    expect(dispatch).not.toHaveBeenCalledWith({ type: "toggle-input", id: "input" });
    expect(container.querySelector('[aria-label="切换 A，当前 0"]')).toBeInTheDocument();
  });

  it("toggles an input when it is clicked without moving", () => {
    const dispatch = vi.fn();
    render(() => (
      <CircuitCanvas
        components={{}}
        dispatch={dispatch}
        graph={{
          nodes: [{ id: "input", kind: "input", name: "A", value: 0, x: 40, y: 40 }],
          edges: [],
        }}
        pendingWire={null}
        portValues={{}}
        selectedNodeId={null}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "切换 A，当前 0" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "toggle-input", id: "input" });
  });

  it("offers dynamic component ports after a marquee selection", () => {
    const graph: CircuitGraph = {
      nodes: [
        { id: "a", kind: "input", name: "A", value: 0, x: 40, y: 40 },
        { id: "b", kind: "input", name: "B", value: 0, x: 40, y: 86 },
        { id: "gate", kind: "and", x: 200, y: 40 },
        { id: "out", kind: "output", name: "P", x: 420, y: 40 },
      ],
      edges: [
        { id: "a-gate", from: { node: "a", port: "out" }, to: { node: "gate", port: "in0" } },
        { id: "b-gate", from: { node: "b", port: "out" }, to: { node: "gate", port: "in1" } },
        { id: "gate-out", from: { node: "gate", port: "out" }, to: { node: "out", port: "in" } },
      ],
    };
    const { container } = render(() => (
      <CircuitCanvas
        components={{}}
        dispatch={vi.fn()}
        graph={graph}
        pendingWire={null}
        portValues={{}}
        selectedNodeId={null}
      />
    ));

    const canvas = screen.getByRole("application", { name: "电路画布" });
    fireEvent.pointerDown(canvas, { clientX: 150, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 400, clientY: 180, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 400, clientY: 180, pointerId: 1 });
    flush();

    expect(container.querySelector(".circuit-canvas-tools")).toHaveTextContent("已框选 1 个元件");
    fireEvent.click(screen.getByRole("button", { name: "封装为自定义组件" }));
    flush();
    expect(screen.getByRole("dialog", { name: "把框选部分变成组件" })).toBeInTheDocument();
    expect(screen.getByText("入口（2）")).toBeInTheDocument();
    expect(screen.getByText("出口（1）")).toBeInTheDocument();
    const mappings = screen.getByLabelText("端口对应关系");
    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
    };
    const portRows = document.querySelectorAll(".custom-component-port-row");
    fireEvent.dragStart(screen.getByLabelText("拖动入口 2"), { dataTransfer });
    flush();
    fireEvent.dragOver(portRows[0], { dataTransfer });
    flush();
    fireEvent.drop(portRows[0], { dataTransfer });
    flush();
    expect(mappings).toHaveTextContent(/B\s*→\s*输入 1/);
    expect(mappings).toHaveTextContent(/A\s*→\s*输入 2/);
    expect(mappings.querySelector("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("查看详细端口对应关系"));
    expect(mappings.querySelector("details")).toHaveAttribute("open");
    expect(mappings).toHaveTextContent("I0当前名：B← B 的 out → AND（gate） 的 in1");
    expect(mappings).toHaveTextContent("O0当前名：P← AND（gate） 的 out → P 的 in");
  });
});
