import { createMemo, For, Show } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import type { Bit, CircuitNode } from "../domain/graph";
import { portsForNode, type ComponentCatalog } from "../lesson/state";
import { nodeHelp, nodeLabel, valueClass } from "./circuitCanvasModel";
import { HEADER_HEIGHT, isPinNode, nodeSize, PORT_SPACING, portAnchor } from "./geometry";

export function CircuitNodes(props: {
  nodes: readonly CircuitNode[];
  components: ComponentCatalog;
  portValues: Record<string, Bit | null>;
  selectedNodeId: string | null;
  selectedNodeIds: readonly string[];
  collapsedOf: (node: CircuitNode) => boolean;
  readOnly: boolean;
  onNodePointerDown: (event: PointerEvent, node: CircuitNode) => void;
  onToggleCollapse: (node: CircuitNode) => void;
  onStartWire: (nodeId: string, port: string) => void;
  onCompleteWire: (nodeId: string, port: string) => void;
  onToggleInput: (nodeId: string) => void;
  consumeSuppressClick: () => boolean;
}) {
  return (
    <g class="nodes">
      <For each={props.nodes} keyed={(node) => node.id}>
        {(node) => {
          const size = createMemo(() => nodeSize(node(), props.components));
          const inputs = createMemo(() => portsForNode(node(), props.components, "in"));
          const outputs = createMemo(() => portsForNode(node(), props.components, "out"));
          const isSelected = createMemo(
            () => node().id === props.selectedNodeId || props.selectedNodeIds.includes(node().id),
          );
          const isCollapsed = createMemo(() => props.collapsedOf(node()));
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
          const toggleCollapse = () => props.onToggleCollapse(node());

          return (
            <g
              class={`circuit-node kind-${node().kind}${isSelected() ? " is-selected" : ""}${isCollapsed() ? " is-collapsed" : ""}`}
              onPointerDown={(event) => props.onNodePointerDown(event, node())}
              transform={`translate(${node().x} ${node().y})`}
            >
              <Show when={titleText()}>{(text) => <title>{text()}</title>}</Show>
              <Show
                fallback={
                  <>
                    <rect class="node-body" height={size().height} rx={6} width={size().width} />
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
                          <Icon name={isCollapsed() ? "chevron-right" : "chevron-down"} size={16} />
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
                                props.onStartWire(node().id, port);
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
                        when={props.readOnly}
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
                                props.onCompleteWire(node().id, port);
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
                        when={props.readOnly}
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
              <Show when={!props.readOnly && (node().kind === "input" || node().kind === "const")}>
                <rect
                  aria-label={`切换 ${nodeLabel(node())}，当前 ${node().value ?? 0}`}
                  class="pin-hit"
                  height={size().height}
                  onClick={(event) => {
                    if (props.consumeSuppressClick()) {
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    event.stopPropagation();
                    props.onToggleInput(node().id);
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
  );
}
