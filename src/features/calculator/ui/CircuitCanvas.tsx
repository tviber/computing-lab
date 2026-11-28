import { Show } from "solid-js";
import { CircuitCanvasTools } from "./CircuitCanvasTools";
import { CircuitNodes } from "./CircuitNodes";
import type { CircuitCanvasProps } from "./circuitCanvasTypes";
import { CircuitWires } from "./CircuitWires";
import { useCircuitCanvas } from "./useCircuitCanvas";

export function CircuitCanvas(props: CircuitCanvasProps) {
  const canvas = useCircuitCanvas(props);

  return (
    <div class="circuit-canvas-wrap">
      <svg
        aria-label="电路画布"
        class="circuit-canvas"
        height={canvas.bounds().height}
        onClick={canvas.handleCanvasClick}
        onPointerCancel={() => canvas.endPointerInteraction()}
        onPointerDown={canvas.onCanvasPointerDown}
        onPointerMove={canvas.onPointerMove}
        onPointerUp={(event) => canvas.endPointerInteraction(event)}
        ref={(element) => canvas.setSvgRef(element)}
        role="application"
        viewBox={`0 0 ${canvas.bounds().width} ${canvas.bounds().height}`}
        width={canvas.bounds().width}
      >
        <defs>
          <pattern height="20" id="grid" patternUnits="userSpaceOnUse" width="20">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" stroke-width="0.5" />
          </pattern>
        </defs>
        <rect
          class="canvas-grid"
          fill="url(#grid)"
          height={canvas.bounds().height}
          width={canvas.bounds().width}
        />
        <Show when={canvas.marqueeRectangle()}>
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

        <CircuitWires
          collapsedOf={canvas.collapsedOf}
          components={props.components}
          edges={props.graph.edges}
          nodesById={canvas.nodesById()}
          onDeleteEdge={canvas.deleteEdge}
          pendingWirePath={canvas.pendingWirePath()}
          portValues={props.portValues}
          readOnly={canvas.readOnly()}
        />
        <CircuitNodes
          collapsedOf={canvas.collapsedOf}
          components={props.components}
          consumeSuppressClick={canvas.consumeSuppressClick}
          nodes={props.graph.nodes}
          onCompleteWire={canvas.completeWire}
          onNodePointerDown={canvas.onNodePointerDown}
          onStartWire={canvas.startWire}
          onToggleCollapse={canvas.toggleCollapse}
          onToggleInput={canvas.toggleInput}
          portValues={props.portValues}
          readOnly={canvas.readOnly()}
          selectedNodeId={props.selectedNodeId}
          selectedNodeIds={canvas.selectedNodeIds()}
        />
      </svg>
      <Show when={!canvas.readOnly()}>
        <CircuitCanvasTools
          dialogOpen={canvas.componentDialogOpen()}
          existingNames={Object.keys(props.components)}
          onClearSelection={canvas.clearSelection}
          onCloseDialog={canvas.closeComponentDialog}
          onCreate={canvas.createComponent}
          onOpenDialog={canvas.openComponentDialog}
          selectedCount={canvas.selectedNodeIds().length}
          selection={canvas.selection()}
        />
      </Show>
    </div>
  );
}
