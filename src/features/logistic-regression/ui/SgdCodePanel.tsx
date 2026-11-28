import { MathFormula, MathText } from "../../../shared/ui/MathFormula";
import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, For, Show, untrack } from "solid-js";
import { PythonEditor } from "../../../shared/ui/PythonEditor";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
import {
  MAX_SAMPLE_SIZE,
  singleUpdateDemo,
  trainLogisticRegression,
} from "../domain/logisticRegression.ts";
import type { LogisticRegressionTestSummary, SgdCodeDraft } from "../domain/protocol.ts";
import { runSgdCode } from "../domain/sgdCode.ts";
import type { LogisticRegressionStageDef } from "../domain/stages.ts";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";
import { LossChartSvg } from "./LossChartSvg.tsx";
import { LossDerivationCard } from "./LossDerivationCard.tsx";
import { SingleStepPenaltyVisual } from "./SingleStepPenaltyVisual.tsx";
import { WeightLossSliceExplorer } from "./WeightLossSliceExplorer.tsx";
import { WeightSpectrum } from "./WeightSpectrum.tsx";

export function SgdCodePanel(props: {
  stage: LogisticRegressionStageDef;
  draft: SgdCodeDraft;
  passed: boolean;
  result: LogisticRegressionTestSummary | null;
  submitting: boolean;
  onChange: (draft: SgdCodeDraft) => void;
  onSubmit: () => void;
}) {
  const [prediction, setPrediction] = createSignal<0 | 1 | null>(null);
  const [mode, setMode] = createSignal<"guided" | "free">("guided");
  const [ran, setRan] = createSignal(false);
  const [executedCode, setExecutedCode] = createSignal<string | null>(null);
  const [chosen, setChosen] = createSignal({
    p: "predict(xi)",
    g: "eta * (p - yi)",
    op: "-=",
    delta: "g * xi[j]",
  });
  const [answers, setAnswers] = createSignal(untrack(() => props.draft.concepts));

  const simulation = createMemo(() =>
    ran() ? runSgdCode(executedCode() ?? props.draft.code, answers()) : null,
  );
  const reference = createMemo(() =>
    trainLogisticRegression({ trainCount: MAX_SAMPLE_SIZE, eta: 0.1, epochs: 20 }),
  );
  const step = createMemo(() => (prediction() === null ? null : singleUpdateDemo(0.2, 1, 0.1)));
  const summary = createMemo(() => simulation()?.summary ?? props.result);
  const guidedCode = createMemo(
    () =>
      `p = ${chosen().p}\ng = ${chosen().g}\nfor j in range(n):\n    w[j] ${chosen().op} ${chosen().delta}`,
  );

  const updateCode = (next: string) => {
    props.onChange({ ...props.draft, code: next });
    setExecutedCode(null);
    setRan(false);
  };

  const selectConcept = (promptId: string, optionIndex: number) => {
    const next = { ...answers(), [promptId]: optionIndex };
    setAnswers(next);
    props.onChange({ ...props.draft, concepts: next });
    setRan(false);
  };

  const runCode = () => setRan(true);
  const parsedErrors = createMemo(() => simulation()?.diagnostics ?? []);

  return (
    <div class="logistic-regression-stage-stack sgd-code-stage">
      <section class="logistic-regression-panel sgd-code-bench">
        <div class="logistic-regression-panel-head">
          <h3>先预测这一步</h3>
          <span class="logistic-regression-badge-neutral">
            垃圾短信 · <MathFormula>{String.raw`y=1`}</MathFormula>
          </span>
        </div>
        <p class="logistic-regression-data-guide">
          这条短信里有「恭喜」「中奖」，没有「妈妈」。模型只给了{" "}
          <MathFormula>{String.raw`p=0.20`}</MathFormula>；学习率{" "}
          <MathFormula>{String.raw`\eta=0.1`}</MathFormula>。
        </p>
        <p class="logistic-regression-quote">【恭喜】你已中奖，点击查看活动详情</p>
        <fieldset class="sgd-choice-group">
          <legend>
            猜一猜：<MathFormula>{String.raw`p-y_i`}</MathFormula> 的符号是什么？
          </legend>
          <SegmentedPicker
            class="logistic-regression-segmented"
            label="p 减 yi 的符号"
            onChange={(next) => setPrediction(next === "1" ? 1 : 0)}
            options={[
              { value: "0", label: "正数" },
              { value: "1", label: "负数" },
            ]}
            value={String(prediction())}
          />
        </fieldset>
        <Show
          fallback={
            <p class="logistic-regression-muted-note">选一个方向，看看这一步的权重怎么动。</p>
          }
          when={step()}
        >
          {(st) => (
            <div class="logistic-regression-note-box sgd-step-result" role="status">
              <p class="logistic-regression-formula-conclusion">
                <MathText>
                  {prediction() === 1
                    ? "命中：$-0.80$，模型猜低了。"
                    : "差一点：$p-y_i=0.20-1=-0.80$。"}
                </MathText>
              </p>
              <p class="logistic-regression-role-desc">
                <MathFormula>{String.raw`g=0.1\times(-0.8)=-0.08`}</MathFormula>，出现过的词执行{" "}
                <MathFormula>{String.raw`w\leftarrow w-g`}</MathFormula>，权重增加 0.08。「妈妈」乘
                0，这一步权重保持不变。
              </p>
              <SingleStepPenaltyVisual
                deltaW={st().deltaW}
                eta={0.1}
                loss={st().loss}
                predP={0.2}
                trueY={1}
              />
            </div>
          )}
        </Show>
      </section>

      <section class="logistic-regression-panel sgd-code-editor-panel">
        <div class="logistic-regression-panel-head">
          <h3>修好学习引擎</h3>
          <SegmentedPicker
            class="logistic-regression-segmented"
            label="代码编辑模式"
            onChange={setMode}
            options={[
              { value: "guided", label: "填空引导" },
              { value: "free", label: "自由手写" },
            ]}
            value={mode()}
          />
        </div>
        <p class="logistic-regression-data-guide">
          每条短信先预测一次；<MathFormula>{String.raw`\eta=0.1`}</MathFormula>、20
          轮、固定训练数据。更新范围只允许简单算式，不会执行 Python 或浏览器命令。
        </p>
        <Show
          fallback={
            <p class="logistic-regression-muted-note">
              可以直接改写 Python 代码。每种缩进用 4 个空格；这里只解析允许的简单算式，不运行任意
              Python。
            </p>
          }
          when={mode() === "guided"}
        >
          <div class="sgd-guided-controls">
            <label class="field-select field-select-native sgd-guide-field">
              <span>
                预测 <MathFormula>{String.raw`p=`}</MathFormula>
              </span>
              <select
                aria-label="预测表达式"
                onChange={(e) => setChosen({ ...chosen(), p: e.currentTarget.value })}
                value={chosen().p}
              >
                <option value="predict(xi)">predict(xi)</option>
                <option value="yi">yi</option>
              </select>
            </label>
            <label class="field-select field-select-native sgd-guide-field">
              <span>
                步长 <MathFormula>{String.raw`g=`}</MathFormula>
              </span>
              <select
                aria-label="步长表达式"
                onChange={(e) => setChosen({ ...chosen(), g: e.currentTarget.value })}
                value={chosen().g}
              >
                <option value="eta * (p - yi)">eta * (p - yi)</option>
                <option value="p - yi">p - yi</option>
                <option value="eta * (yi - p)">eta * (yi - p)</option>
              </select>
            </label>
            <label class="field-select field-select-native sgd-guide-field">
              <span>词权重更新 w[j]</span>
              <select
                aria-label="更新方向"
                onChange={(e) => setChosen({ ...chosen(), op: e.currentTarget.value })}
                value={chosen().op}
              >
                <option value="-=">-= 减去梯度</option>
                <option value="+=">+= 加上梯度</option>
              </select>
            </label>
            <label class="field-select field-select-native sgd-guide-field">
              <span>更新量</span>
              <select
                aria-label="特征乘数"
                onChange={(e) => setChosen({ ...chosen(), delta: e.currentTarget.value })}
                value={chosen().delta}
              >
                <option value="g * xi[j]">g * xi[j]</option>
                <option value="g">g</option>
                <option value="eta * (p - yi) * xi[j]">eta * (p - yi) * xi[j]</option>
              </select>
            </label>
          </div>
        </Show>
        <div class="sgd-editor-wrap">
          <div class="sgd-editor-head">
            <span class="logistic-regression-field-label">单条短信的更新代码</span>
            <span class="logistic-regression-badge-neutral">Python</span>
          </div>
          <PythonEditor
            ariaDescribedBy="sgd-code-help"
            ariaLabel="单条短信的更新代码"
            class="sgd-editor"
            editable={mode() === "free"}
            height={mode() === "guided" ? "150px" : "210px"}
            onChange={(next) => {
              if (mode() === "free") updateCode(next);
            }}
            value={mode() === "guided" ? guidedCode() : props.draft.code}
          />
          <p class="logistic-regression-muted-note" id="sgd-code-help">
            可用变量：xi、yi、w、j、n、eta、predict。每条短信只算一次 p；支持 + − × ÷、括号和
            xi[j]、w[j]。不需要写训练轮循环。
          </p>
        </div>
        <Button
          class="button button-primary"
          onClick={() => {
            if (mode() === "guided") {
              const code = guidedCode();
              updateCode(code);
              setExecutedCode(code);
            }
            runCode();
          }}
          type="button"
        >
          运行并检查 20 轮
        </Button>
        <Show when={parsedErrors().length > 0}>
          <ul class="sgd-diagnostics" role="alert">
            <For each={parsedErrors()}>
              {(error) => (
                <li>
                  {error.line ? `第 ${error.line} 行：` : ""}
                  {error.message}
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={simulation()?.run}>
          {(simRun) => (
            <div class="sgd-run-result" role="status">
              <p class="logistic-regression-formula-conclusion">
                训练损失 {simRun().epochsHistory.at(-1)?.trainLoss.toFixed(4)} · 验证损失{" "}
                {simRun().epochsHistory.at(-1)?.valLoss.toFixed(4)}
              </p>
              <p class="logistic-regression-role-desc">
                绿色为参考 SGD，蓝色为你写的更新。曲线重合表示每轮记录的损失一致；
                还要结合单步检查和概念题，确认更新规则正确。
              </p>
              <LossChartSvg
                history={simRun().epochsHistory}
                referenceHistory={reference().epochsHistory}
              />
              <WeightSpectrum
                heading="你的代码学到了哪些词"
                topHam={simRun().epochsHistory.at(-1)?.topHam ?? []}
                topSpam={simRun().epochsHistory.at(-1)?.topSpam ?? []}
                trainCount={MAX_SAMPLE_SIZE}
              />
            </div>
          )}
        </Show>
      </section>

      <section class="logistic-regression-panel sgd-code-theory-panel">
        <div class="logistic-regression-panel-head">
          <h3>为什么沿负梯度更新</h3>
          <span class="logistic-regression-badge-neutral">单样本梯度 → 平均损失</span>
        </div>
        <p class="logistic-regression-data-guide">
          代码每读一条短信，就用这一条的 <MathFormula>{String.raw`p-y`}</MathFormula>{" "}
          调一次权重。下面的推导解释这个梯度从哪里来；
          权重切片则固定其他参数，展示一组含某个词的短信的<strong>平均损失</strong>
          。切片的坡度是这组短信的 <MathFormula>{String.raw`p-y`}</MathFormula>{" "}
          的平均值；某一条短信的梯度方向可能与它不同， 因此单步更新不保证降低整组短信的平均损失。
        </p>
        <LossDerivationCard />
      </section>

      <WeightLossSliceExplorer
        trainedModel={simulation()?.run?.finalModel ?? reference().finalModel}
      />

      <ConceptChecklist
        answers={answers()}
        onSelectCorrect={selectConcept}
        prompts={props.stage.prompts}
      />
      <JudgeVerdictCard
        hasNextStage={false}
        passed={simulation()?.passed ?? props.passed}
        summary={summary()}
      />
      <Button
        class="button button-primary"
        disabled={props.submitting || !simulation()}
        onClick={() => props.onSubmit()}
        type="button"
      >
        {props.submitting ? "判定中…" : "提交选做挑战"}
      </Button>
    </div>
  );
}
