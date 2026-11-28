import { createMemo, For, Show } from "solid-js";
import { useChangeAnimation } from "../../../shared/ui/useChangeAnimation";
import type { Bit, CircuitEdge, CircuitNode } from "../domain/graph";
import type { ComponentCatalog } from "../lesson/state";
import { nodeLabel, valueClass } from "./circuitCanvasModel";
import { portAnchor, wirePath } from "./geometry";

export function CircuitWires(props: {
  edges: readonly CircuitEdge[];
  nodesById: Map<string, CircuitNode>;
  components: ComponentCatalog;
  portValues: Record<string, Bit | null>;
  collapsedOf: (node: CircuitNode) => boolean;
  readOnly: boolean;
  onDeleteEdge: (edgeId: string) => void;
  pendingWirePath: string | null;
}) {
  return (
    <g class="wires">
      {/* Each input has one driver, even in older drafts that reused wire IDs. */}
      <For each={props.edges} keyed={(edge) => JSON.stringify([edge.to.node, edge.to.port])}>
        {(edge) => {
          const endpoints = createMemo(() => {
            const current = edge();
            const fromNode = props.nodesById.get(current.from.node);
            const toNode = props.nodesById.get(current.to.node);
            if (!fromNode || !toNode || props.collapsedOf(fromNode) || props.collapsedOf(toNode)) {
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
              {(endpoint) => (
                <g>
                  <path
                    aria-label={
                      props.readOnly
                        ? `连线 ${nodeLabel(endpoint().fromNode)} → ${nodeLabel(endpoint().toNode)}`
                        : `连线 ${nodeLabel(endpoint().fromNode)} → ${nodeLabel(endpoint().toNode)}，删除`
                    }
                    class={`wire${valueClass(endpoint().value)}`}
                    d={endpoint().d}
                    onClick={(event) => {
                      if (props.readOnly) return;
                      event.stopPropagation();
                      props.onDeleteEdge(endpoint().edge.id);
                    }}
                    role="button"
                  />
                  <path
                    aria-hidden="true"
                    class="wire-signal"
                    d={endpoint().d}
                    pathLength={1}
                    ref={signalRef}
                  />
                </g>
              )}
            </Show>
          );
        }}
      </For>

      <Show when={props.pendingWirePath}>
        {(path) => <path class="wire is-pending" d={path()} />}
      </Show>
    </g>
  );
}
