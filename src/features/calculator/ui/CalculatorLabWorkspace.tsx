import type { JSX } from "@solidjs/web";
import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, For, Show } from "solid-js";
import { LabPageShell, type LabResetControlsProps } from "../../../shared/lab/LabPageShell";
import { StageBrief } from "../../../shared/lab/StageBrief";
import { Disclosure } from "../../../shared/ui/Disclosure";
import { evaluateGraph } from "../domain/evaluate";
import { GATE_LABEL, type CircuitGraph, type CircuitNode } from "../domain/graph";
import {
  componentCatalog,
  componentMap,
  graphOf,
  stageOf,
  type CalculatorLessonAction,
  type CalculatorLessonState,
} from "../lesson/state";
import { BusReadout } from "./BusReadout";
import { AnnotatedText, CalculatorTermGuide } from "./CalculatorTerms";
import { CircuitCanvas } from "./CircuitCanvas";
import { CustomComponentDialog, type ComponentizeForm } from "./CustomComponentDialog";
import { nodeDropPosition } from "./geometry";
import { StageRail } from "./StageRail";
import { TestPanel } from "./TestPanel";
import "./calculator.css";

export type CalculatorLabWorkspaceProps = {
  state: CalculatorLessonState;
  dispatch: (action: CalculatorLessonAction) => void;
  error?: string | null;
  onSubmit?: () => void;
  submitting?: boolean;
  freeNavigation?: boolean;
  resetControls?: LabResetControlsProps;
  inspect?: { graph: CircuitGraph; meta?: JSX.Element } | null;
};

export function CalculatorLabWorkspace(props: CalculatorLabWorkspaceProps) {
  const [editingComponentName, setEditingComponentName] = createSignal<string | null>(null);

  const submitting = () => props.submitting ?? false;
  const freeNavigation = () => props.freeNavigation ?? false;
  const inspect = () => props.inspect ?? null;

  const graph = createMemo(() => inspect()?.graph ?? graphOf(props.state));
  const components = createMemo(() => componentMap(props.state));
  const componentDefinitions = createMemo(() => componentCatalog(props.state));
  const stage = createMemo(() => stageOf(props.state));
  const selectedNode = createMemo(() =>
    graph().nodes.find((node) => node.id === props.state.selectedNodeId),
  );
  const selectedCustomComponent = createMemo(() => {
    const selected = selectedNode();
    return selected?.kind === "component"
      ? props.state.unlockedSubmodules.find(
          (component) =>
            component.custom &&
            component.name.toLocaleLowerCase() === (selected.name ?? "").toLocaleLowerCase(),
        )
      : undefined;
  });
  const editingComponent = createMemo(() => {
    const targetName = editingComponentName();
    return targetName
      ? props.state.unlockedSubmodules.find(
          (component) =>
            component.custom &&
            component.name.toLocaleLowerCase() === targetName.toLocaleLowerCase(),
        )
      : undefined;
  });

  const preview = createMemo(() => evaluateGraph(graph(), {}, components()));

  const placeNode = (node: Pick<CircuitNode, "kind" | "name" | "value">) =>
    props.dispatch({
      type: "add-node",
      ...node,
      ...nodeDropPosition(node, graph(), componentDefinitions()),
    });

  return (
    <>
      <LabPageShell
        collapsedLabel={`第 ${props.state.stageIndex} 关`}
        contentClassName="calculator-layout"
        labId="calculator"
        rail={
          <StageRail
            freeNavigation={freeNavigation()}
            onDeleteCustomComponent={(name) =>
              props.dispatch({ type: "delete-custom-component", name })
            }
            onEditCustomComponent={setEditingComponentName}
            onPlaceComponent={(name) => placeNode({ kind: "component", name })}
            onSelectStage={(index) =>
              props.dispatch({ type: "select-stage", stageIndex: index, force: freeNavigation() })
            }
            passedStages={props.state.passedStages}
            stageIndex={props.state.stageIndex}
            unlockedSubmodules={props.state.unlockedSubmodules}
          />
        }
        railWidth={232}
        resetControls={inspect() ? undefined : props.resetControls}
      >
        <main aria-label="计算器实验区" class="calculator-workspace">
          <Show when={stage()}>
            {(currentStage) => (
              <StageBrief
                footer={<CalculatorTermGuide />}
                hints={[<AnnotatedText text={currentStage().hint} />]}
                passed={props.state.passedStages.includes(currentStage().index)}
                takeaway={currentStage().takeaway}
                task={<AnnotatedText text={currentStage().description} />}
              >
                <Show when={currentStage().details}>
                  {(details) => (
                    <Disclosure class="stage-details" summary="为什么？">
                      <p>
                        <AnnotatedText text={details()} />
                      </p>
                    </Disclosure>
                  )}
                </Show>
              </StageBrief>
            )}
          </Show>

          <Show when={props.error}>
            {(err) => (
              <p class="test-error" role="alert">
                {err()}
              </p>
            )}
          </Show>
          <Show when={props.state.message}>
            {(message) => (
              <p
                class={`lab-message${props.state.judgeOutcome?.passed ? " is-pass" : ""}`}
                role="status"
              >
                {message()}
                <Button onClick={() => props.dispatch({ type: "dismiss-message" })} type="button">
                  知道了
                </Button>
              </p>
            )}
          </Show>

          <Show when={inspect()}>{(target) => target().meta}</Show>

          <Show when={!inspect()}>
            <section aria-label="元件" class="palette">
              <p class="eyebrow">元件</p>
              <div class="palette-items">
                <For each={stage()?.primitives ?? []}>
                  {(kind) => (
                    <Button class="palette-chip" onClick={() => placeNode({ kind })} type="button">
                      <AnnotatedText text={GATE_LABEL[kind]} />
                    </Button>
                  )}
                </For>
                <Show when={(stage()?.extraPrimitives?.length ?? 0) > 0}>
                  <Disclosure class="palette-more" summary="更多元件">
                    <div class="palette-items">
                      <For each={stage()?.extraPrimitives ?? []}>
                        {(kind) => (
                          <Button
                            class="palette-chip"
                            onClick={() => placeNode({ kind })}
                            type="button"
                          >
                            <AnnotatedText text={GATE_LABEL[kind]} />
                          </Button>
                        )}
                      </For>
                    </div>
                  </Disclosure>
                </Show>
                <Show when={stage()?.constants}>
                  <Button
                    class="palette-chip is-const"
                    onClick={() => placeNode({ kind: "const", value: 1 })}
                    type="button"
                  >
                    常量 1
                  </Button>
                  <Button
                    class="palette-chip is-const"
                    onClick={() => placeNode({ kind: "const", value: 0 })}
                    type="button"
                  >
                    常量 0
                  </Button>
                </Show>
              </div>
            </section>
          </Show>

          <Show when={stage()}>
            {(currentStage) => <BusReadout pins={preview().pins} stage={currentStage()} />}
          </Show>

          <Show keyed when={props.state.stageIndex}>
            {(_) => (
              <CircuitCanvas
                components={componentDefinitions()}
                dispatch={props.dispatch}
                graph={graph()}
                pendingWire={props.state.pendingWire}
                portValues={preview().portValues}
                readOnly={inspect() !== null}
                selectedNodeId={props.state.selectedNodeId}
              />
            )}
          </Show>

          <Show when={!inspect()}>
            <section class="canvas-help">
              <p>
                点输出端口再点输入端口即可连线；点连线可删除；点输入引脚可切换 0/1
                观察电路实时反应；在空白处拖动可框选元件并封装为自定义组件。选中组件后可折叠，隐藏其全部连接线；也可用
                Ctrl/Cmd+Z 撤销、Delete 删除。
              </p>
              <Show when={preview().error}>
                {(err) => (
                  <p class="test-error" role="alert">
                    电路无法求值：{err().detail}
                  </p>
                )}
              </Show>
            </section>

            <div class="calculator-actions">
              <Button
                class="button button-secondary"
                onClick={() => props.dispatch({ type: "run-public-tests" })}
                type="button"
              >
                运行公开测试
              </Button>
              <Button
                class="button button-secondary"
                disabled={
                  props.state.past[props.state.past.length - 1]?.stageIndex !==
                  props.state.stageIndex
                }
                onClick={() => props.dispatch({ type: "undo" })}
                type="button"
              >
                撤销
              </Button>
              <Show when={props.onSubmit}>
                {(submit) => (
                  <Button
                    class="button button-primary"
                    disabled={submitting()}
                    onClick={() => submit()()}
                    type="button"
                  >
                    {submitting() ? "判定中…" : "提交"}
                  </Button>
                )}
              </Show>
              <Button
                class="button button-ghost"
                onClick={() => props.dispatch({ type: "reset-stage" })}
                type="button"
              >
                清空本关
              </Button>
              <Show when={props.state.selectedNodeId}>
                {(selectedId) => (
                  <Button
                    class="button button-ghost"
                    onClick={() => props.dispatch({ type: "delete-node", id: selectedId() })}
                    type="button"
                  >
                    删除选中元件
                  </Button>
                )}
              </Show>
              <Show when={selectedNode()?.kind === "component" ? selectedNode() : undefined}>
                {(selected) => (
                  <Button
                    aria-expanded={!selected().collapsed ? "true" : "false"}
                    class="button button-ghost disclosure-trigger"
                    onClick={() =>
                      props.dispatch({ type: "toggle-collapse-node", id: selected().id })
                    }
                    type="button"
                  >
                    {selected().collapsed ? "展开组件" : "折叠组件"}
                  </Button>
                )}
              </Show>
              <Show when={selectedCustomComponent() && selectedNode()}>
                {(selected) => (
                  <Button
                    class="button button-ghost"
                    onClick={() => props.dispatch({ type: "expand-component", id: selected().id })}
                    type="button"
                  >
                    拆分回去
                  </Button>
                )}
              </Show>
            </div>

            <TestPanel
              judgeOutcome={props.state.judgeOutcome}
              runOutcome={props.state.runOutcome}
              stage={stage()}
            />
          </Show>
        </main>
      </LabPageShell>
      <Show keyed when={editingComponent()}>
        {(component) => (
          <CustomComponentDialog
            component={component}
            existingNames={props.state.unlockedSubmodules.map((item) => item.name)}
            onCancel={() => setEditingComponentName(null)}
            onUpdate={(form: ComponentizeForm) => {
              props.dispatch({
                type: "edit-custom-component",
                name: component.name,
                newName: form.name,
                inputNames: form.inputNames,
                outputNames: form.outputNames,
                inputPortKeys: form.inputPortKeys,
                outputPortKeys: form.outputPortKeys,
              });
              setEditingComponentName(null);
            }}
          />
        )}
      </Show>
    </>
  );
}
