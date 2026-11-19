import { useMemo, useState, type ReactNode } from "react";
import { evaluateGraph } from "../domain/evaluate";
import { GATE_LABEL, type CircuitGraph, type GateKind } from "../domain/graph";
import {
  componentCatalog,
  componentMap,
  graphOf,
  paletteGates,
  stageOf,
  type CalculatorLessonAction,
  type CalculatorLessonState,
} from "../lesson/state";
import { LabPageShell, type LabResetControlsProps } from "../../../shared/lab/LabPageShell";
import { HintDisclosure } from "../../../shared/ui/HintDisclosure";
import { BusReadout } from "./BusReadout";
import { CircuitCanvas } from "./CircuitCanvas";
import { CoachCard, type CalculatorCoach } from "./CoachCard";
import { StageRail } from "./StageRail";
import { TestPanel } from "./TestPanel";
import { AnnotatedText, CalculatorTermGuide } from "./CalculatorTerms";
import { CustomComponentDialog, type ComponentizeForm } from "./CustomComponentDialog";
import "./calculator.css";

export type CalculatorLabWorkspaceProps = {
  state: CalculatorLessonState;
  dispatch: (action: CalculatorLessonAction) => void;
  coach?: CalculatorCoach;
  projectLoaded: boolean;
  error?: string | null;
  onSubmit?: () => void;
  submitting?: boolean;
  freeNavigation?: boolean;
  resetControls?: LabResetControlsProps;
  inspect?: { graph: CircuitGraph; meta?: ReactNode } | null;
};

export function CalculatorLabWorkspace({
  state,
  dispatch,
  coach,
  projectLoaded,
  error,
  onSubmit,
  submitting = false,
  freeNavigation = false,
  resetControls,
  inspect = null,
}: CalculatorLabWorkspaceProps) {
  const [editingComponentName, setEditingComponentName] = useState<string | null>(null);

  const graph = inspect?.graph ?? graphOf(state);
  const components = useMemo(() => componentMap(state), [state.unlockedSubmodules]);
  const componentDefinitions = useMemo(() => componentCatalog(state), [state.unlockedSubmodules]);
  const stage = stageOf(state);
  const selectedNode = graph.nodes.find((node) => node.id === state.selectedNodeId);
  const selectedCustomComponent =
    selectedNode?.kind === "component"
      ? state.unlockedSubmodules.find(
          (component) =>
            component.custom &&
            component.name.toLocaleLowerCase() === (selectedNode.name ?? "").toLocaleLowerCase(),
        )
      : undefined;
  const editingComponent = editingComponentName
    ? state.unlockedSubmodules.find(
        (component) =>
          component.custom &&
          component.name.toLocaleLowerCase() === editingComponentName.toLocaleLowerCase(),
      )
    : undefined;

  const preview = useMemo(() => evaluateGraph(graph, {}, components), [graph, components]);

  const addGate = (kind: GateKind) =>
    dispatch({ type: "add-node", kind, x: 300, y: 60 + (state.nextId % 6) * 44 });

  return (
    <>
      <LabPageShell
        collapsedLabel={`第 ${state.stageIndex} 关`}
        contentClassName="calculator-layout"
        forceExpand={coach?.focusesOn("my-components")}
        labId="calculator"
        rail={
          <StageRail
            coachHighlight={coach?.focusesOn("my-components") && stage?.id === "full-adder"}
            freeNavigation={freeNavigation}
            passedStages={state.passedStages}
            onPlaceComponent={(name) =>
              dispatch({ type: "add-node", kind: "component", name, x: 320, y: 80 })
            }
            onEditCustomComponent={setEditingComponentName}
            onDeleteCustomComponent={(name) => dispatch({ type: "delete-custom-component", name })}
            onSelectStage={(index) =>
              dispatch({ type: "select-stage", stageIndex: index, force: freeNavigation })
            }
            stageIndex={state.stageIndex}
            unlockedSubmodules={state.unlockedSubmodules}
          />
        }
        railWidth={232}
        resetControls={inspect ? undefined : resetControls}
      >
        <main aria-label="计算器实验区" className="calculator-workspace">
          <section className="stage-brief">
            <p>{stage ? <AnnotatedText text={stage.description} /> : null}</p>
            {stage?.details ? (
              <details className="stage-details">
                <summary>为什么？</summary>
                <p>
                  <AnnotatedText text={stage.details} />
                </p>
              </details>
            ) : null}
            {stage && state.passedStages.includes(stage.index) ? (
              <p className="stage-takeaway">本关收获：{stage.takeaway}</p>
            ) : null}
            {stage ? (
              <HintDisclosure key={stage.id}>
                <AnnotatedText text={stage.hint} />
              </HintDisclosure>
            ) : null}
            {coach && projectLoaded && !coach.step ? (
              <button className="stage-guide-trigger" onClick={coach.restart} type="button">
                查看引导
              </button>
            ) : null}
            <CalculatorTermGuide />
          </section>

          {error ? (
            <p className="test-error" role="alert">
              {error}
            </p>
          ) : null}
          {state.message ? (
            <p
              className={`lab-message${state.judgeOutcome?.passed ? " is-pass" : ""}`}
              role="status"
            >
              {state.message}
              <button onClick={() => dispatch({ type: "dismiss-message" })} type="button">
                知道了
              </button>
            </p>
          ) : null}

          {inspect ? inspect.meta : null}

          {!inspect ? (
            <section aria-label="元件" className="palette">
              <p className="eyebrow">元件</p>
              <div className="palette-items">
                {paletteGates(state).map((kind) => (
                  <button
                    className={`palette-chip${coach?.focusesOn("palette-gate", kind) ? " coach-focus" : ""}`}
                    key={kind}
                    onClick={() => addGate(kind)}
                    type="button"
                  >
                    <AnnotatedText text={GATE_LABEL[kind]} />
                  </button>
                ))}
                {stage?.extraPrimitives?.length ? (
                  <details className="palette-more">
                    <summary>更多元件</summary>
                    <div className="palette-items">
                      {stage.extraPrimitives.map((kind) => (
                        <button
                          className="palette-chip"
                          key={kind}
                          onClick={() => addGate(kind)}
                          type="button"
                        >
                          <AnnotatedText text={GATE_LABEL[kind]} />
                        </button>
                      ))}
                    </div>
                  </details>
                ) : null}
                {stage?.constants ? (
                  <>
                    <button
                      className="palette-chip is-const"
                      onClick={() =>
                        dispatch({ type: "add-node", kind: "const", value: 1, x: 120, y: 300 })
                      }
                      type="button"
                    >
                      常量 1
                    </button>
                    <button
                      className={`palette-chip is-const${coach?.focusesOn("palette-const", 0) ? " coach-focus" : ""}`}
                      onClick={() =>
                        dispatch({ type: "add-node", kind: "const", value: 0, x: 120, y: 340 })
                      }
                      type="button"
                    >
                      常量 0
                    </button>
                  </>
                ) : null}
              </div>
            </section>
          ) : null}

          {stage ? (
            <div className={coach?.focusesOn("bus-readout") ? "coach-focus" : undefined}>
              <BusReadout pins={preview.pins} stage={stage} />
            </div>
          ) : null}

          {coach ? (
            <CoachCard
              onAdvance={coach.advance}
              onSkip={coach.skip}
              onSkipAll={coach.skipAll}
              step={coach.step}
            />
          ) : null}

          <CircuitCanvas
            coachFocus={coach?.canvasFocus}
            components={componentDefinitions}
            dispatch={dispatch}
            graph={graph}
            pendingWire={state.pendingWire}
            portValues={preview.portValues}
            readOnly={inspect !== null}
            selectedNodeId={state.selectedNodeId}
          />

          {!inspect ? (
            <>
              <section className="canvas-help">
                <p>
                  点输出端口再点输入端口即可连线；点连线可删除；点输入引脚可切换 0/1
                  观察电路实时反应；在空白处拖动可框选元件并封装为自定义组件。选中组件后可折叠，隐藏其全部连接线；也可用
                  Ctrl/Cmd+Z 撤销、Delete 删除。
                </p>
                {preview.error ? (
                  <p className="test-error" role="alert">
                    电路无法求值：{preview.error.detail}
                  </p>
                ) : null}
              </section>

              <div className="calculator-actions">
                <button
                  className={`button button-secondary${coach?.focusesOn("run-tests") ? " coach-focus" : ""}`}
                  onClick={() => dispatch({ type: "run-public-tests" })}
                  type="button"
                >
                  运行公开测试
                </button>
                <button
                  className="button button-secondary"
                  disabled={state.past[state.past.length - 1]?.stageIndex !== state.stageIndex}
                  onClick={() => dispatch({ type: "undo" })}
                  type="button"
                >
                  撤销
                </button>
                {onSubmit ? (
                  <button
                    className={`button button-primary${coach?.focusesOn("submit") ? " coach-focus" : ""}`}
                    disabled={submitting}
                    onClick={onSubmit}
                    type="button"
                  >
                    {submitting ? "判定中…" : "提交"}
                  </button>
                ) : null}
                <button
                  className="button button-ghost"
                  onClick={() => dispatch({ type: "reset-stage" })}
                  type="button"
                >
                  清空本关
                </button>
                {state.selectedNodeId ? (
                  <button
                    className="button button-ghost"
                    onClick={() =>
                      dispatch({ type: "delete-node", id: state.selectedNodeId as string })
                    }
                    type="button"
                  >
                    删除选中元件
                  </button>
                ) : null}
                {selectedNode?.kind === "component" ? (
                  <button
                    className="button button-ghost"
                    onClick={() => dispatch({ type: "toggle-collapse-node", id: selectedNode.id })}
                    type="button"
                  >
                    {selectedNode.collapsed ? "展开组件" : "折叠组件"}
                  </button>
                ) : null}
                {selectedCustomComponent && selectedNode ? (
                  <button
                    className="button button-ghost"
                    onClick={() => dispatch({ type: "expand-component", id: selectedNode.id })}
                    type="button"
                  >
                    拆分回去
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {!inspect ? (
            <TestPanel
              judgeOutcome={state.judgeOutcome}
              runOutcome={state.runOutcome}
              stage={stage}
            />
          ) : null}
        </main>
      </LabPageShell>
      {editingComponent ? (
        <CustomComponentDialog
          component={editingComponent}
          existingNames={state.unlockedSubmodules.map((component) => component.name)}
          onCancel={() => setEditingComponentName(null)}
          onUpdate={(form: ComponentizeForm) => {
            dispatch({
              type: "edit-custom-component",
              name: editingComponent.name,
              newName: form.name,
              inputNames: form.inputNames,
              outputNames: form.outputNames,
              inputPortKeys: form.inputPortKeys,
              outputPortKeys: form.outputPortKeys,
            });
            setEditingComponentName(null);
          }}
        />
      ) : null}
    </>
  );
}
