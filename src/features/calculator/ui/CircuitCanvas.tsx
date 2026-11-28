import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import { useChangeAnimation } from "../../../shared/ui/useChangeAnimation";
import { inspectComponentSelection } from "../domain/componentize";
import { GATE_LABEL, type Bit, type CircuitGraph, type CircuitNode } from "../domain/graph";
import {
  portsForNode,
  type CalculatorLessonAction,
  type ComponentCatalog,
  type PendingWire,
} from "../lesson/state";
import { CALCULATOR_TERM_NOTES } from "./CalculatorTerms";
import { CustomComponentDialog, type ComponentizeForm } from "./CustomComponentDialog";
import {
  canvasBounds,
  HEADER_HEIGHT,
  isPinNode,
  nodeSize,
  PORT_SPACING,
  portAnchor,
  wirePath,
} from "./geometry";

type CircuitCanvasProps = {
  graph: CircuitGraph;
  components: ComponentCatalog;
  portValues: Record<string, Bit | null>;
  selectedNodeId: string | null;
  pendingWire: PendingWire;
  dispatch: (action: CalculatorLessonAction) => void;
  /**
   * Read-only presentation for forensics/review: no editing gestures, no
   * keyboard shortcuts, no mutation dispatch. Collapse badges still toggle —
   * locally, without touching the stored graph.
   */
  readOnly?: boolean;
};

const NODE_DRAG_THRESHOLD = 4;

function nodeLabel(node: CircuitNode): string {
  if (node.kind === "input" || node.kind === "output") return node.name ?? "?";
  if (node.kind === "const") return String(node.value ?? 0);
  if (node.kind === "component") return node.name ?? "?";
  return GATE_LABEL[node.kind] ?? node.kind;
}

function valueClass(value: Bit | null | undefined): string {
  if (value === 1) return " is-high";
  if (value === 0) return " is-low";
  return " is-floating";
}

function nodeHelp(node: CircuitNode): string | null {
  const label = nodeLabel(node);
  return label in CALCULATOR_TERM_NOTES
    ? CALCULATOR_TERM_NOTES[label as keyof typeof CALCULATOR_TERM_NOTES]
    : null;
}

export function CircuitCanvas(props: CircuitCanvasProps) {
  let svgRef: SVGSVGElement | undefined;
  let dragRef: {
    id: string;
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null = null;
  let suppressClick = false;

  const readOnly = () => props.readOnly ?? false;

  let marqueeRef: {
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null = null;
  const [marquee, setMarqueeSignal] = createSignal<{
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null>(null);
  const updateMarquee = (
    next: { start: { x: number; y: number }; current: { x: number; y: number } } | null,
  ) => {
    marqueeRef = next;
    setMarqueeSignal(next);
  };
  const [selectedNodeIds, setSelectedNodeIds] = createSignal<string[]>([]);
  const [componentDialogOpen, setComponentDialogOpen] = createSignal(false);
  const [cursor, setCursor] = createSignal<{ x: number; y: number } | null>(null);
  // Read-only viewers may expand a collapsed component locally; the stored
  // flag is never touched.
  const [collapsedOverrides, setCollapsedOverrides] = createSignal<Record<string, boolean>>({});

  const collapsedOf = (node: CircuitNode) =>
    readOnly()
      ? (collapsedOverrides()[node.id] ?? node.collapsed ?? false)
      : (node.collapsed ?? false);

  const bounds = createMemo(() => canvasBounds(props.graph, props.components));
  const nodesById = createMemo(() => new Map(props.graph.nodes.map((n) => [n.id, n])));
  const selection = createMemo(() => inspectComponentSelection(props.graph, selectedNodeIds()));

  const marqueeRectangle = createMemo(() => {
    const current = marquee();
    if (!current) return null;
    return {
      x: Math.min(current.start.x, current.current.x),
      y: Math.min(current.start.y, current.current.y),
      width: Math.abs(current.current.x - current.start.x),
      height: Math.abs(current.current.y - current.start.y),
    };
  });

  const pendingWirePath = createMemo(() => {
    const pw = props.pendingWire;
    const cur = cursor();
    if (!pw || !cur) return null;
    const fromNode = nodesById().get(pw.from.node);
    if (!fromNode) return null;
    const from = portAnchor(fromNode, pw.from.port, "out", props.components);
    return wirePath(from, cur);
  });

  createEffect(
    () => props.graph,
    (graph) => {
      const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
      setSelectedNodeIds((current) => {
        const next = current.filter((id) => graphNodeIds.has(id));
        return next.length === current.length ? current : next;
      });
    },
  );

  const toCanvas = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onNodePointerDown = (event: PointerEvent, node: CircuitNode) => {
    if (readOnly()) return;
    event.stopPropagation();
    suppressClick = false;
    const point = toCanvas(event);
    dragRef = {
      id: node.id,
      dx: point.x - node.x,
      dy: point.y - node.y,
      startX: point.x,
      startY: point.y,
      moved: false,
    };
    setSelectedNodeIds([node.id]);
    props.dispatch({ type: "start-node-move", id: node.id });
    props.dispatch({ type: "select-node", id: node.id });
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const onCanvasPointerDown = (event: PointerEvent) => {
    if (readOnly()) return;
    suppressClick = false;
    if ((event.target as Element).closest(".wire")) return;
    if (props.pendingWire) {
      props.dispatch({ type: "cancel-wire" });
      return;
    }
    const point = toCanvas(event);
    setSelectedNodeIds([]);
    props.dispatch({ type: "select-node", id: null });
    updateMarquee({ start: point, current: point });
    svgRef?.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (readOnly()) return;
    const point = toCanvas(event);
    if (marqueeRef) {
      updateMarquee({ ...marqueeRef, current: point });
      return;
    }
    if (props.pendingWire) setCursor(point);
    const drag = dragRef;
    if (!drag) return;
    if (
      !drag.moved &&
      Math.max(Math.abs(point.x - drag.startX), Math.abs(point.y - drag.startY)) <
        NODE_DRAG_THRESHOLD
    ) {
      return;
    }
    drag.moved = true;
    props.dispatch({
      type: "move-node",
      id: drag.id,
      x: Math.max(0, Math.round(point.x - drag.dx)),
      y: Math.max(0, Math.round(point.y - drag.dy)),
    });
  };

  const endPointerInteraction = (event?: PointerEvent) => {
    if (readOnly()) return;
    const nodeDrag = dragRef;
    const hadNodeDrag = Boolean(nodeDrag);
    if (nodeDrag?.moved) suppressClick = true;
    const currentMarquee = marqueeRef;
    if (currentMarquee) {
      const point = event ? toCanvas(event) : currentMarquee.current;
      const rectangle = {
        x: Math.min(currentMarquee.start.x, point.x),
        y: Math.min(currentMarquee.start.y, point.y),
        width: Math.abs(point.x - currentMarquee.start.x),
        height: Math.abs(point.y - currentMarquee.start.y),
      };
      if (rectangle.width >= 8 && rectangle.height >= 8) {
        setSelectedNodeIds(
          props.graph.nodes
            .filter((node) => {
              const size = nodeSize(node, props.components);
              return (
                node.x >= rectangle.x &&
                node.y >= rectangle.y &&
                node.x + size.width <= rectangle.x + rectangle.width &&
                node.y + size.height <= rectangle.y + rectangle.height
              );
            })
            .map((node) => node.id),
        );
      } else {
        setSelectedNodeIds([]);
      }
      updateMarquee(null);
      if (event && svgRef?.hasPointerCapture?.(event.pointerId)) {
        svgRef.releasePointerCapture?.(event.pointerId);
      }
    }
    dragRef = null;
    if (hadNodeDrag) props.dispatch({ type: "finish-node-move" });
  };

  createEffect(
    () => readOnly(),
    (isReadOnly) => {
      if (isReadOnly) return;
      const onKeyDown = (event: KeyboardEvent) => {
        if (
          document.querySelector(
            'dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
          )
        ) {
          return;
        }
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest("input, textarea, select, [contenteditable='true']")
        ) {
          return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          props.dispatch({ type: "undo" });
          return;
        }
        if (event.key !== "Delete") return;

        const currentSelectedIds = selectedNodeIds();
        const ids = currentSelectedIds.length
          ? currentSelectedIds
          : props.selectedNodeId
            ? [props.selectedNodeId]
            : [];
        if (ids.length === 0) return;
        event.preventDefault();
        props.dispatch({ type: "delete-nodes", ids });
        setSelectedNodeIds([]);
      };

      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    },
  );

  const onCreateComponent = (form: ComponentizeForm) => {
    props.dispatch({
      type: "componentize-selection",
      selectedIds: selection().selectedIds,
      name: form.name,
      inputNames: form.inputNames,
      outputNames: form.outputNames,
      inputPortKeys: form.inputPortKeys,
      outputPortKeys: form.outputPortKeys,
    });
    setComponentDialogOpen(false);
    setSelectedNodeIds([]);
  };

  return (
    <div class="circuit-canvas-wrap">
      <svg
        aria-label="电路画布"
        class="circuit-canvas"
        height={bounds().height}
        onClick={(event) => {
          if (readOnly()) return;
          if (suppressClick) {
            suppressClick = false;
            event.preventDefault();
            return;
          }
          if (props.pendingWire) props.dispatch({ type: "cancel-wire" });
        }}
        onPointerCancel={() => endPointerInteraction()}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endPointerInteraction(event)}
        ref={(el) => {
          svgRef = el;
        }}
        role="application"
        viewBox={`0 0 ${bounds().width} ${bounds().height}`}
        width={bounds().width}
      >
        <defs>
          <pattern height="20" id="grid" patternUnits="userSpaceOnUse" width="20">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" stroke-width="0.5" />
          </pattern>
        </defs>
        <rect
          class="canvas-grid"
          fill="url(#grid)"
          height={bounds().height}
          width={bounds().width}
        />
        <Show when={marqueeRectangle()}>
          {(rect) => (
            <rect
              class="selection-box"
              height={rect().height}
              pointer-events="none"
              width={rect().width}
              x={rect().x}
              y={rect().y}
            />
          )}
        </Show>

        <g class="wires">
          {/* Each input has one driver, even in older drafts that reused wire IDs. */}
          <For
            each={props.graph.edges}
            keyed={(edge) => JSON.stringify([edge.to.node, edge.to.port])}
          >
            {(edge) => {
              const endpoints = createMemo(() => {
                const current = edge();
                const fromNode = nodesById().get(current.from.node);
                const toNode = nodesById().get(current.to.node);
                if (!fromNode || !toNode || collapsedOf(fromNode) || collapsedOf(toNode)) {
                  return null;
                }
                const from = portAnchor(fromNode, current.from.port, "out", props.components);
                const to = portAnchor(toNode, current.to.port, "in", props.components);
                return {
                  edge: current,
                  fromNode,
                  toNode,
                  d: wirePath(from, to),
                  value: props.portValues[`${current.from.node}#${current.from.port}`],
                };
              });
              // This traces changed values, not simulated electrical propagation time.
              // Undefined (collapsed or unevaluated) resets the pulse baseline.
              const signalRef = useChangeAnimation<SVGPathElement>(
                () => endpoints()?.value ?? undefined,
                [
                  { strokeDashoffset: "0.14", opacity: 0 },
                  { opacity: 0.85, offset: 0.2 },
                  { strokeDashoffset: "-1", opacity: 0 },
                ],
                { duration: 480, easing: "ease-out" },
              );
              return (
                <Show when={endpoints()}>
                  {(ep) => (
                    <g>
                      <path
                        aria-label={
                          readOnly()
                            ? `连线 ${nodeLabel(ep().fromNode)} → ${nodeLabel(ep().toNode)}`
                            : `连线 ${nodeLabel(ep().fromNode)} → ${nodeLabel(ep().toNode)}，删除`
                        }
                        class={`wire${valueClass(ep().value)}`}
                        d={ep().d}
                        onClick={(event) => {
                          if (readOnly()) return;
                          event.stopPropagation();
                          props.dispatch({ type: "delete-edge", id: ep().edge.id });
                        }}
                        role="button"
                      />
                      <path
                        aria-hidden="true"
                        class="wire-signal"
                        d={ep().d}
                        pathLength={1}
                        ref={signalRef}
                      />
                    </g>
                  )}
                </Show>
              );
            }}
          </For>

          <Show when={pendingWirePath()}>
            {(path) => <path class="wire is-pending" d={path()} />}
          </Show>
        </g>

        <g class="nodes">
          <For each={props.graph.nodes} keyed={(node) => node.id}>
            {(node) => {
              const size = createMemo(() => nodeSize(node(), props.components));
              const inputs = createMemo(() => portsForNode(node(), props.components, "in"));
              const outputs = createMemo(() => portsForNode(node(), props.components, "out"));
              const isSelected = createMemo(
                () => node().id === props.selectedNodeId || selectedNodeIds().includes(node().id),
              );
              const isCollapsed = createMemo(() => collapsedOf(node()));
              const pinValue = createMemo(() =>
                node().kind === "output"
                  ? props.portValues[`${node().id}#in`]
                  : props.portValues[`${node().id}#out`],
              );
              const titleText = createMemo(() =>
                [nodeHelp(node()), isCollapsed() ? "已折叠，连接线已隐藏" : null]
                  .filter(Boolean)
                  .join("；"),
              );

              const toggleCollapse = () => {
                const current = node();
                if (readOnly()) {
                  setCollapsedOverrides((overrides) => ({
                    ...overrides,
                    [current.id]: !isCollapsed(),
                  }));
                  return;
                }
                props.dispatch({ type: "toggle-collapse-node", id: current.id });
              };

              return (
                <g
                  class={`circuit-node kind-${node().kind}${isSelected() ? " is-selected" : ""}${isCollapsed() ? " is-collapsed" : ""}`}
                  onPointerDown={(event) => onNodePointerDown(event, node())}
                  transform={`translate(${node().x} ${node().y})`}
                >
                  <Show when={titleText()}>{(text) => <title>{text()}</title>}</Show>
                  <Show
                    fallback={
                      <>
                        <rect
                          class="node-body"
                          height={size().height}
                          rx={6}
                          width={size().width}
                        />
                        <text class="node-label" x={size().width / 2} y={15}>
                          {nodeLabel(node())}
                        </text>
                        <Show when={node().kind === "component"}>
                          <g
                            aria-expanded={!isCollapsed() ? "true" : "false"}
                            aria-label={
                              isCollapsed()
                                ? `展开组件 ${nodeLabel(node())}`
                                : `折叠组件 ${nodeLabel(node())}`
                            }
                            class="node-collapse-toggle"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleCollapse();
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              event.stopPropagation();
                              toggleCollapse();
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            role="button"
                            tabindex={0}
                          >
                            <rect
                              class="node-collapse-toggle-bg"
                              height={16}
                              rx={4}
                              width={16}
                              x={size().width - 21}
                              y={3}
                            />
                            <g
                              class="node-collapse-toggle-icon"
                              transform={`translate(${size().width - 21} 3)`}
                            >
                              <Icon
                                name={isCollapsed() ? "chevron-right" : "chevron-down"}
                                size={16}
                              />
                            </g>
                          </g>
                        </Show>
                        <Show when={!isCollapsed()}>
                          <For each={inputs()}>
                            {(port, index) => (
                              <text
                                class="port-label is-in"
                                x={5}
                                y={HEADER_HEIGHT + index() * PORT_SPACING + PORT_SPACING / 2 + 3}
                              >
                                {port}
                              </text>
                            )}
                          </For>
                          <For each={outputs()}>
                            {(port, index) => (
                              <text
                                class="port-label is-out"
                                text-anchor="start"
                                x={size().width + 9}
                                y={HEADER_HEIGHT + index() * PORT_SPACING + PORT_SPACING / 2 + 3}
                              >
                                {port}
                              </text>
                            )}
                          </For>
                        </Show>
                      </>
                    }
                    when={isPinNode(node())}
                  >
                    <rect
                      class={`pin-body${valueClass(pinValue())}`}
                      height={size().height}
                      rx={15}
                      width={size().width}
                    />
                    <text class="pin-label" x={size().width / 2} y={size().height / 2 + 4}>
                      {nodeLabel(node())}
                    </text>
                  </Show>

                  {/* Output ports start a wire. The visible dot stays r=5;
                      a transparent r=8 hit disc carries the interaction so
                      the usable target matches the ±9px spacing budget. */}
                  <Show when={!isCollapsed()}>
                    <For each={outputs()}>
                      {(port) => {
                        const anchor = createMemo(() =>
                          portAnchor(node(), port, "out", props.components),
                        );
                        const portClass = () =>
                          `port is-out${valueClass(props.portValues[`${node().id}#${port}`])}`;
                        return (
                          <Show
                            fallback={
                              <g>
                                <circle
                                  aria-label={`${nodeLabel(node())} 输出 ${port}`}
                                  class="port-hit"
                                  cx={anchor().x - node().x}
                                  cy={anchor().y - node().y}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    props.dispatch({
                                      type: "start-wire",
                                      from: { node: node().id, port },
                                    });
                                  }}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  r={8}
                                  role="button"
                                />
                                <circle
                                  class={portClass()}
                                  cx={anchor().x - node().x}
                                  cy={anchor().y - node().y}
                                  pointer-events="none"
                                  r={5}
                                />
                              </g>
                            }
                            when={readOnly()}
                          >
                            <circle
                              aria-label={`${nodeLabel(node())} 输出 ${port}`}
                              class={portClass()}
                              cx={anchor().x - node().x}
                              cy={anchor().y - node().y}
                              pointer-events="none"
                              r={5}
                            />
                          </Show>
                        );
                      }}
                    </For>
                  </Show>

                  {/* Input ports complete a wire. */}
                  <Show when={!isCollapsed()}>
                    <For each={inputs()}>
                      {(port) => {
                        const anchor = createMemo(() =>
                          portAnchor(node(), port, "in", props.components),
                        );
                        const portClass = () =>
                          `port is-in${valueClass(props.portValues[`${node().id}#${port}`])}`;
                        return (
                          <Show
                            fallback={
                              <g>
                                <circle
                                  aria-label={`${nodeLabel(node())} 输入 ${port}`}
                                  class="port-hit"
                                  cx={anchor().x - node().x}
                                  cy={anchor().y - node().y}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (props.pendingWire) {
                                      props.dispatch({
                                        type: "complete-wire",
                                        to: { node: node().id, port },
                                      });
                                    }
                                  }}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  r={8}
                                  role="button"
                                />
                                <circle
                                  class={portClass()}
                                  cx={anchor().x - node().x}
                                  cy={anchor().y - node().y}
                                  pointer-events="none"
                                  r={5}
                                />
                              </g>
                            }
                            when={readOnly()}
                          >
                            <circle
                              aria-label={`${nodeLabel(node())} 输入 ${port}`}
                              class={portClass()}
                              cx={anchor().x - node().x}
                              cy={anchor().y - node().y}
                              pointer-events="none"
                              r={5}
                            />
                          </Show>
                        );
                      }}
                    </For>
                  </Show>

                  {/* Toggling a source pin drives the live preview. */}
                  <Show when={!readOnly() && (node().kind === "input" || node().kind === "const")}>
                    <rect
                      aria-label={`切换 ${nodeLabel(node())}，当前 ${node().value ?? 0}`}
                      class="pin-hit"
                      height={size().height}
                      onClick={(event) => {
                        if (suppressClick) {
                          suppressClick = false;
                          event.preventDefault();
                          event.stopPropagation();
                          return;
                        }
                        event.stopPropagation();
                        props.dispatch({ type: "toggle-input", id: node().id });
                      }}
                      role="button"
                      width={size().width}
                    />
                  </Show>
                </g>
              );
            }}
          </For>
        </g>
      </svg>
      <Show when={!readOnly() && selectedNodeIds().length > 0}>
        <div class="circuit-canvas-tools">
          <span>
            已框选 {selection().selectedIds.length} 个元件
            {selection().error ? ` · ${selection().error}` : "，可封装为可重复使用的组件"}
          </span>
          <div>
            <Button
              class="button button-secondary"
              disabled={Boolean(selection().error)}
              onClick={() => setComponentDialogOpen(true)}
              type="button"
            >
              封装为自定义组件
            </Button>
            <Button
              class="button button-ghost"
              onClick={() => setSelectedNodeIds([])}
              type="button"
            >
              清除选区
            </Button>
            <span class="circuit-canvas-tool-note">选中画布中的自定义组件后可拆分回去</span>
          </div>
        </div>
      </Show>
      <Show when={!readOnly() && componentDialogOpen()}>
        <CustomComponentDialog
          existingNames={Object.keys(props.components)}
          onCancel={() => setComponentDialogOpen(false)}
          onCreate={onCreateComponent}
          selection={selection()}
        />
      </Show>
    </div>
  );
}
