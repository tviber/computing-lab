import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon } from "../../../shared/ui/Icon";
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
  isPinNode,
  nodeSize,
  portAnchor,
  wirePath,
  PORT_SPACING,
  HEADER_HEIGHT,
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

export function CircuitCanvas({
  graph,
  components,
  portValues,
  selectedNodeId,
  pendingWire,
  dispatch,
  readOnly = false,
}: CircuitCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    id: string;
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [marquee, setMarquee] = useState<{
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [componentDialogOpen, setComponentDialogOpen] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // Read-only viewers may expand a collapsed component locally; the stored
  // flag is never touched.
  const [collapsedOverrides, setCollapsedOverrides] = useState<Record<string, boolean>>({});
  const collapsedOf = (node: CircuitNode) =>
    readOnly ? (collapsedOverrides[node.id] ?? node.collapsed ?? false) : (node.collapsed ?? false);
  const bounds = canvasBounds(graph, components);
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const selection = useMemo(
    () => inspectComponentSelection(graph, selectedNodeIds),
    [graph, selectedNodeIds],
  );

  useEffect(() => {
    const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
    setSelectedNodeIds((current) => {
      const next = current.filter((id) => graphNodeIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [graph]);

  const toCanvas = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onNodePointerDown = (event: ReactPointerEvent, node: CircuitNode) => {
    if (readOnly) return;
    event.stopPropagation();
    suppressClickRef.current = false;
    const point = toCanvas(event);
    dragRef.current = {
      id: node.id,
      dx: point.x - node.x,
      dy: point.y - node.y,
      startX: point.x,
      startY: point.y,
      moved: false,
    };
    setSelectedNodeIds([node.id]);
    dispatch({ type: "start-node-move", id: node.id });
    dispatch({ type: "select-node", id: node.id });
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const onCanvasPointerDown = (event: ReactPointerEvent) => {
    if (readOnly) return;
    suppressClickRef.current = false;
    if ((event.target as Element).closest(".wire")) return;
    if (pendingWire) {
      dispatch({ type: "cancel-wire" });
      return;
    }
    const point = toCanvas(event);
    setSelectedNodeIds([]);
    dispatch({ type: "select-node", id: null });
    setMarquee({ start: point, current: point });
    svgRef.current?.setPointerCapture?.(event.pointerId);
  };

  const selectionRectangle = () => {
    if (!marquee) return null;
    return {
      x: Math.min(marquee.start.x, marquee.current.x),
      y: Math.min(marquee.start.y, marquee.current.y),
      width: Math.abs(marquee.current.x - marquee.start.x),
      height: Math.abs(marquee.current.y - marquee.start.y),
    };
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (readOnly) return;
    const point = toCanvas(event);
    if (marquee) {
      setMarquee((current) => (current ? { ...current, current: point } : current));
      return;
    }
    if (pendingWire) setCursor(point);
    const drag = dragRef.current;
    if (!drag) return;
    if (
      !drag.moved &&
      Math.max(Math.abs(point.x - drag.startX), Math.abs(point.y - drag.startY)) <
        NODE_DRAG_THRESHOLD
    ) {
      return;
    }
    drag.moved = true;
    dispatch({
      type: "move-node",
      id: drag.id,
      x: Math.max(0, Math.round(point.x - drag.dx)),
      y: Math.max(0, Math.round(point.y - drag.dy)),
    });
  };

  const endPointerInteraction = (event?: ReactPointerEvent) => {
    if (readOnly) return;
    const nodeDrag = dragRef.current;
    const hadNodeDrag = Boolean(nodeDrag);
    if (nodeDrag?.moved) suppressClickRef.current = true;
    if (marquee) {
      const point = event ? toCanvas(event) : marquee.current;
      const rectangle = {
        x: Math.min(marquee.start.x, point.x),
        y: Math.min(marquee.start.y, point.y),
        width: Math.abs(point.x - marquee.start.x),
        height: Math.abs(point.y - marquee.start.y),
      };
      if (rectangle.width >= 8 && rectangle.height >= 8) {
        setSelectedNodeIds(
          graph.nodes
            .filter((node) => {
              const size = nodeSize(node, components);
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
      setMarquee(null);
      if (event && svgRef.current?.hasPointerCapture?.(event.pointerId)) {
        svgRef.current.releasePointerCapture?.(event.pointerId);
      }
    }
    dragRef.current = null;
    if (hadNodeDrag) dispatch({ type: "finish-node-move" });
  };

  useEffect(() => {
    if (readOnly) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: "undo" });
        return;
      }
      if (event.key !== "Delete") return;

      const ids = selectedNodeIds.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
      if (ids.length === 0) return;
      event.preventDefault();
      dispatch({ type: "delete-nodes", ids });
      setSelectedNodeIds([]);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, selectedNodeId, selectedNodeIds, readOnly]);

  const marqueeRectangle = selectionRectangle();
  const onCreateComponent = (form: ComponentizeForm) => {
    dispatch({
      type: "componentize-selection",
      selectedIds: selection.selectedIds,
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
    <div className="circuit-canvas-wrap">
      <svg
        aria-label="电路画布"
        className="circuit-canvas"
        height={bounds.height}
        onPointerCancel={() => endPointerInteraction()}
        onPointerMove={onPointerMove}
        onPointerDown={onCanvasPointerDown}
        onPointerUp={(event) => endPointerInteraction(event)}
        onClick={(event) => {
          if (readOnly) return;
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            event.preventDefault();
            return;
          }
          if (pendingWire) dispatch({ type: "cancel-wire" });
        }}
        ref={svgRef}
        role="application"
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        width={bounds.width}
      >
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect
          className="canvas-grid"
          height={bounds.height}
          width={bounds.width}
          fill="url(#grid)"
        />
        {marqueeRectangle ? (
          <rect
            className="selection-box"
            height={marqueeRectangle.height}
            pointerEvents="none"
            width={marqueeRectangle.width}
            x={marqueeRectangle.x}
            y={marqueeRectangle.y}
          />
        ) : null}

        <g className="wires">
          {graph.edges.map((edge) => {
            const fromNode = nodesById.get(edge.from.node);
            const toNode = nodesById.get(edge.to.node);
            if (!fromNode || !toNode || collapsedOf(fromNode) || collapsedOf(toNode)) {
              return null;
            }
            const from = portAnchor(fromNode, edge.from.port, "out", components);
            const to = portAnchor(toNode, edge.to.port, "in", components);
            const value = portValues[`${edge.from.node}#${edge.from.port}`];
            return (
              <path
                aria-label={
                  readOnly
                    ? `连线 ${nodeLabel(fromNode)} → ${nodeLabel(toNode)}`
                    : `连线 ${nodeLabel(fromNode)} → ${nodeLabel(toNode)}，删除`
                }
                className={`wire${valueClass(value)}`}
                d={wirePath(from, to)}
                key={edge.id}
                onClick={(event) => {
                  if (readOnly) return;
                  event.stopPropagation();
                  dispatch({ type: "delete-edge", id: edge.id });
                }}
                role="button"
              />
            );
          })}

          {pendingWire && cursor
            ? (() => {
                const fromNode = nodesById.get(pendingWire.from.node);
                if (!fromNode) return null;
                const from = portAnchor(fromNode, pendingWire.from.port, "out", components);
                return <path className="wire is-pending" d={wirePath(from, cursor)} />;
              })()
            : null}
        </g>

        <g className="nodes">
          {graph.nodes.map((node) => {
            const size = nodeSize(node, components);
            const inputs = portsForNode(node, components, "in");
            const outputs = portsForNode(node, components, "out");
            const isSelected = node.id === selectedNodeId || selectedNodeIds.includes(node.id);
            const pinValue =
              node.kind === "output" ? portValues[`${node.id}#in`] : portValues[`${node.id}#out`];

            return (
              <g
                className={`circuit-node kind-${node.kind}${isSelected ? " is-selected" : ""}${collapsedOf(node) ? " is-collapsed" : ""}`}
                key={node.id}
                onPointerDown={(event) => onNodePointerDown(event, node)}
                transform={`translate(${node.x} ${node.y})`}
              >
                {nodeHelp(node) || collapsedOf(node) ? (
                  <title>
                    {[nodeHelp(node), collapsedOf(node) ? "已折叠，连接线已隐藏" : null]
                      .filter(Boolean)
                      .join("；")}
                  </title>
                ) : null}
                {isPinNode(node) ? (
                  <>
                    <rect
                      className={`pin-body${valueClass(pinValue)}`}
                      height={size.height}
                      rx={15}
                      width={size.width}
                    />
                    <text className="pin-label" x={size.width / 2} y={size.height / 2 + 4}>
                      {nodeLabel(node)}
                    </text>
                  </>
                ) : (
                  <>
                    <rect className="node-body" height={size.height} rx={6} width={size.width} />
                    <text className="node-label" x={size.width / 2} y={15}>
                      {nodeLabel(node)}
                    </text>
                    {node.kind === "component" ? (
                      <g
                        aria-expanded={!collapsedOf(node)}
                        aria-label={
                          collapsedOf(node)
                            ? `展开组件 ${nodeLabel(node)}`
                            : `折叠组件 ${nodeLabel(node)}`
                        }
                        className="node-collapse-toggle"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (readOnly) {
                            setCollapsedOverrides((current) => ({
                              ...current,
                              [node.id]: !collapsedOf(node),
                            }));
                            return;
                          }
                          dispatch({ type: "toggle-collapse-node", id: node.id });
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          event.stopPropagation();
                          if (readOnly) {
                            setCollapsedOverrides((current) => ({
                              ...current,
                              [node.id]: !collapsedOf(node),
                            }));
                            return;
                          }
                          dispatch({ type: "toggle-collapse-node", id: node.id });
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        role="button"
                        tabIndex={0}
                      >
                        <rect
                          className="node-collapse-toggle-bg"
                          height={16}
                          rx={4}
                          width={16}
                          x={size.width - 21}
                          y={3}
                        />
                        <g
                          className="node-collapse-toggle-icon"
                          transform={`translate(${size.width - 21} 3)`}
                        >
                          <Icon
                            name={collapsedOf(node) ? "chevron-right" : "chevron-down"}
                            size={16}
                          />
                        </g>
                      </g>
                    ) : null}
                    {!collapsedOf(node) &&
                      inputs.map((port, index) => (
                        <text
                          className="port-label is-in"
                          key={`l-${port}`}
                          x={5}
                          y={HEADER_HEIGHT + index * PORT_SPACING + PORT_SPACING / 2 + 3}
                        >
                          {port}
                        </text>
                      ))}
                    {!collapsedOf(node) &&
                      outputs.map((port, index) => (
                        <text
                          className="port-label is-out"
                          key={`r-${port}`}
                          textAnchor="start"
                          x={size.width + 9}
                          y={HEADER_HEIGHT + index * PORT_SPACING + PORT_SPACING / 2 + 3}
                        >
                          {port}
                        </text>
                      ))}
                  </>
                )}

                {/* Output ports start a wire. The visible dot stays r=5;
                    a transparent r=8 hit disc carries the interaction so
                    the usable target matches the ±9px spacing budget. */}
                {!collapsedOf(node) &&
                  outputs.map((port) => {
                    const anchor = portAnchor(node, port, "out", components);
                    const className = `port is-out${valueClass(portValues[`${node.id}#${port}`])}`;
                    if (readOnly) {
                      return (
                        <circle
                          aria-label={`${nodeLabel(node)} 输出 ${port}`}
                          className={className}
                          cx={anchor.x - node.x}
                          cy={anchor.y - node.y}
                          key={`o-${port}`}
                          pointerEvents="none"
                          r={5}
                        />
                      );
                    }
                    return (
                      <g key={`o-${port}`}>
                        <circle
                          aria-label={`${nodeLabel(node)} 输出 ${port}`}
                          className="port-hit"
                          cx={anchor.x - node.x}
                          cy={anchor.y - node.y}
                          onClick={(event) => {
                            event.stopPropagation();
                            dispatch({ type: "start-wire", from: { node: node.id, port } });
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          r={8}
                          role="button"
                        />
                        <circle
                          className={className}
                          cx={anchor.x - node.x}
                          cy={anchor.y - node.y}
                          pointerEvents="none"
                          r={5}
                        />
                      </g>
                    );
                  })}

                {/* Input ports complete a wire. */}
                {!collapsedOf(node) &&
                  inputs.map((port) => {
                    const anchor = portAnchor(node, port, "in", components);
                    const className = `port is-in${valueClass(portValues[`${node.id}#${port}`])}`;
                    if (readOnly) {
                      return (
                        <circle
                          aria-label={`${nodeLabel(node)} 输入 ${port}`}
                          className={className}
                          cx={anchor.x - node.x}
                          cy={anchor.y - node.y}
                          key={`i-${port}`}
                          pointerEvents="none"
                          r={5}
                        />
                      );
                    }
                    return (
                      <g key={`i-${port}`}>
                        <circle
                          aria-label={`${nodeLabel(node)} 输入 ${port}`}
                          className="port-hit"
                          cx={anchor.x - node.x}
                          cy={anchor.y - node.y}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (pendingWire)
                              dispatch({ type: "complete-wire", to: { node: node.id, port } });
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          r={8}
                          role="button"
                        />
                        <circle
                          className={className}
                          cx={anchor.x - node.x}
                          cy={anchor.y - node.y}
                          pointerEvents="none"
                          r={5}
                        />
                      </g>
                    );
                  })}

                {/* Toggling a source pin drives the live preview. */}
                {!readOnly && (node.kind === "input" || node.kind === "const") ? (
                  <rect
                    aria-label={`切换 ${nodeLabel(node)}，当前 ${node.value ?? 0}`}
                    className="pin-hit"
                    height={size.height}
                    onClick={(event) => {
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }
                      event.stopPropagation();
                      dispatch({ type: "toggle-input", id: node.id });
                    }}
                    role="button"
                    width={size.width}
                  />
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
      {!readOnly && selectedNodeIds.length > 0 ? (
        <div className="circuit-canvas-tools">
          <span>
            已框选 {selection.selectedIds.length} 个元件
            {selection.error ? ` · ${selection.error}` : "，可封装为可重复使用的组件"}
          </span>
          <div>
            <button
              className="button button-secondary"
              disabled={Boolean(selection.error)}
              onClick={() => setComponentDialogOpen(true)}
              type="button"
            >
              封装为自定义组件
            </button>
            <button
              className="button button-ghost"
              onClick={() => setSelectedNodeIds([])}
              type="button"
            >
              清除选区
            </button>
            <span className="circuit-canvas-tool-note">选中画布中的自定义组件后可拆分回去</span>
          </div>
        </div>
      ) : null}
      {!readOnly && componentDialogOpen ? (
        <CustomComponentDialog
          existingNames={Object.keys(components)}
          onCancel={() => setComponentDialogOpen(false)}
          onCreate={onCreateComponent}
          selection={selection}
        />
      ) : null}
    </div>
  );
}
