import { createEffect, createMemo, createSignal } from "solid-js";
import { inspectComponentSelection } from "../domain/componentize";
import type { CircuitNode } from "../domain/graph";
import type { CircuitCanvasProps } from "./circuitCanvasTypes";
import {
  MARQUEE_MIN_SIZE,
  NODE_DRAG_THRESHOLD,
  marqueeSelection,
  rectangleBetween,
} from "./circuitCanvasModel";
import type { ComponentizeForm } from "./CustomComponentDialog";
import { canvasBounds, portAnchor, wirePath } from "./geometry";

export function useCircuitCanvas(options: CircuitCanvasProps) {
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
  let marqueeRef: {
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null = null;

  const [marquee, setMarqueeSignal] = createSignal<{
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = createSignal<string[]>([]);
  const [componentDialogOpen, setComponentDialogOpen] = createSignal(false);
  const [cursor, setCursor] = createSignal<{ x: number; y: number } | null>(null);
  const [collapsedOverrides, setCollapsedOverrides] = createSignal<Record<string, boolean>>({});

  const readOnly = () => options.readOnly ?? false;
  const updateMarquee = (
    next: { start: { x: number; y: number }; current: { x: number; y: number } } | null,
  ) => {
    marqueeRef = next;
    setMarqueeSignal(next);
  };

  const collapsedOf = (node: CircuitNode) =>
    readOnly()
      ? (collapsedOverrides()[node.id] ?? node.collapsed ?? false)
      : (node.collapsed ?? false);

  const bounds = createMemo(() => canvasBounds(options.graph, options.components));
  const nodesById = createMemo(() => new Map(options.graph.nodes.map((node) => [node.id, node])));
  const selection = createMemo(() => inspectComponentSelection(options.graph, selectedNodeIds()));
  const marqueeRectangle = createMemo(() => {
    const current = marquee();
    return current ? rectangleBetween(current.start, current.current) : null;
  });
  const pendingWirePath = createMemo(() => {
    const pending = options.pendingWire;
    const currentCursor = cursor();
    if (!pending || !currentCursor) return null;
    const fromNode = nodesById().get(pending.from.node);
    if (!fromNode) return null;
    const from = portAnchor(fromNode, pending.from.port, "out", options.components);
    return wirePath(from, currentCursor);
  });

  createEffect(
    () => options.graph,
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
    options.dispatch({ type: "start-node-move", id: node.id });
    options.dispatch({ type: "select-node", id: node.id });
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const onCanvasPointerDown = (event: PointerEvent) => {
    if (readOnly()) return;
    suppressClick = false;
    if ((event.target as Element).closest(".wire")) return;
    if (options.pendingWire) {
      options.dispatch({ type: "cancel-wire" });
      return;
    }
    const point = toCanvas(event);
    setSelectedNodeIds([]);
    options.dispatch({ type: "select-node", id: null });
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
    if (options.pendingWire) setCursor(point);
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
    options.dispatch({
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
      const rectangle = rectangleBetween(currentMarquee.start, point);
      if (rectangle.width >= MARQUEE_MIN_SIZE && rectangle.height >= MARQUEE_MIN_SIZE) {
        setSelectedNodeIds(marqueeSelection(options.graph.nodes, options.components, rectangle));
      } else {
        setSelectedNodeIds([]);
      }
      updateMarquee(null);
      if (event && svgRef?.hasPointerCapture?.(event.pointerId)) {
        svgRef.releasePointerCapture?.(event.pointerId);
      }
    }
    dragRef = null;
    if (hadNodeDrag) options.dispatch({ type: "finish-node-move" });
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
          options.dispatch({ type: "undo" });
          return;
        }
        if (event.key !== "Delete") return;

        const currentSelectedIds = selectedNodeIds();
        const ids = currentSelectedIds.length
          ? currentSelectedIds
          : options.selectedNodeId
            ? [options.selectedNodeId]
            : [];
        if (ids.length === 0) return;
        event.preventDefault();
        options.dispatch({ type: "delete-nodes", ids });
        setSelectedNodeIds([]);
      };

      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    },
  );

  const toggleCollapse = (node: CircuitNode) => {
    if (readOnly()) {
      setCollapsedOverrides((overrides) => ({
        ...overrides,
        [node.id]: !collapsedOf(node),
      }));
      return;
    }
    options.dispatch({ type: "toggle-collapse-node", id: node.id });
  };

  const consumeSuppressClick = () => {
    if (!suppressClick) return false;
    suppressClick = false;
    return true;
  };

  const handleCanvasClick = (event: MouseEvent) => {
    if (readOnly()) return;
    if (consumeSuppressClick()) {
      event.preventDefault();
      return;
    }
    if (options.pendingWire) options.dispatch({ type: "cancel-wire" });
  };

  const createComponent = (form: ComponentizeForm) => {
    options.dispatch({
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

  return {
    bounds,
    nodesById,
    selection,
    marqueeRectangle,
    pendingWirePath,
    selectedNodeIds,
    componentDialogOpen,
    collapsedOf,
    readOnly,
    setSvgRef: (element: SVGSVGElement) => {
      svgRef = element;
    },
    onNodePointerDown,
    onCanvasPointerDown,
    onPointerMove,
    endPointerInteraction,
    handleCanvasClick,
    consumeSuppressClick,
    toggleCollapse,
    startWire: (nodeId: string, port: string) =>
      options.dispatch({ type: "start-wire", from: { node: nodeId, port } }),
    completeWire: (nodeId: string, port: string) => {
      if (options.pendingWire) {
        options.dispatch({ type: "complete-wire", to: { node: nodeId, port } });
      }
    },
    toggleInput: (nodeId: string) => options.dispatch({ type: "toggle-input", id: nodeId }),
    deleteEdge: (edgeId: string) => options.dispatch({ type: "delete-edge", id: edgeId }),
    openComponentDialog: () => setComponentDialogOpen(true),
    closeComponentDialog: () => setComponentDialogOpen(false),
    clearSelection: () => setSelectedNodeIds([]),
    createComponent,
  };
}
