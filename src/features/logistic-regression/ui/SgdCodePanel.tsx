import { useMemo, useState } from "react";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";
import { LossChartSvg } from "./LossChartSvg.tsx";
import { SingleStepPenaltyVisual } from "./SingleStepPenaltyVisual.tsx";
import { WeightSpectrum } from "./WeightSpectrum.tsx";
import { runSgdCode } from "../domain/sgdCode.ts";
import {
  trainLogisticRegression,
  MAX_SAMPLE_SIZE,
  singleUpdateDemo,
} from "../domain/logisticRegression.ts";
import type { LogisticRegressionTestSummary, SgdCodeDraft } from "../domain/protocol.ts";
import type { LogisticRegressionStageDef } from "../domain/stages.ts";

export function SgdCodePanel({
  stage,
  draft,
  passed,
  result,
  submitting,
  onChange,
  onSubmit,
}: {
  stage: LogisticRegressionStageDef;
  draft: SgdCodeDraft;
  passed: boolean;
  result: LogisticRegressionTestSummary | null;
  submitting: boolean;
  onChange: (draft: SgdCodeDraft) => void;
  onSubmit: () => void;
}) {
  const [prediction, setPrediction] = useState<0 | 1 | null>(null);
  const [mode, setMode] = useState<"guided" | "free">("guided");
  const [ran, setRan] = useState(false);
  const [executedCode, setExecutedCode] = useState<string | null>(null);
  const [chosen, setChosen] = useState({
    p: "predict(xi)",
    g: "eta * (p - yi)",
    op: "-=",
    delta: "g * xi[j]",
  });
  const [answers, setAnswers] = useState(draft.concepts);
  const simulation = useMemo(
    () => (ran ? runSgdCode(executedCode ?? draft.code, answers) : null),
    [ran, executedCode, draft.code, answers],
  );
  const reference = useMemo(
    () => trainLogisticRegression({ trainCount: MAX_SAMPLE_SIZE, eta: 0.1, epochs: 20 }),
    [],
  );
  const step = prediction === null ? null : singleUpdateDemo(0.2, 1, 0.1);
  const summary = simulation?.summary ?? result;
  const updateCode = (next: string) => {
    onChange({ ...draft, code: next });
    setExecutedCode(null);
    setRan(false);
  };
  const selectConcept = (promptId: string, optionIndex: number) => {
    const next = { ...answers, [promptId]: optionIndex };
    setAnswers(next);
    onChange({ ...draft, concepts: next });
    setRan(false);
  };
  const runCode = () => setRan(true);
  const parsedErrors = simulation?.diagnostics ?? [];

  return (
    <div className="logistic-regression-stage-stack sgd-code-stage">
      <section className="logistic-regression-panel sgd-code-bench">
        <div className="logistic-regression-panel-head">
          <h3>01 / 先预测这一步</h3>
          <span className="logistic-regression-badge-neutral">垃圾短信 · y=1</span>
        </div>
        <p>这条短信里有「恭喜」「中奖」，没有「妈妈」。模型只给了 p=0.20；学习率 η=0.1。</p>
        <p className="sgd-code-sms">【恭喜】你已中奖，点击查看活动详情</p>
        <fieldset className="sgd-choice-group">
          <legend>猜一猜：p − yi 的符号是什么？</legend>
          <button type="button" aria-pressed={prediction === 0} onClick={() => setPrediction(0)}>
            正数
          </button>
          <button type="button" aria-pressed={prediction === 1} onClick={() => setPrediction(1)}>
            负数
          </button>
        </fieldset>
        {step ? (
          <div className="sgd-step-result" role="status">
            <strong>
              {prediction === 1 ? "命中：−0.80，模型猜低了。" : "差一点：p−yi = 0.20−1 = −0.80。"}
            </strong>
            <p>
              g=0.1×(−0.8)=−0.08，出现过的词执行 w ← w−g，权重增加 0.08。「妈妈」乘
              0，本轮保持不变。
            </p>
            <SingleStepPenaltyVisual
              predP={0.2}
              trueY={1}
              eta={0.1}
              loss={step.loss}
              deltaW={step.deltaW}
            />
          </div>
        ) : (
          <p className="logistic-regression-muted-note">选一个方向，看看这一步的权重怎么动。</p>
        )}
      </section>

      <section className="logistic-regression-panel sgd-code-editor-panel">
        <div className="logistic-regression-panel-head">
          <h3>02 / 修好学习引擎</h3>
          <div className="sgd-mode-switch">
            <button
              className={mode === "guided" ? "is-active" : ""}
              type="button"
              aria-pressed={mode === "guided"}
              onClick={() => setMode("guided")}
            >
              填空引导
            </button>
            <button
              className={mode === "free" ? "is-active" : ""}
              type="button"
              aria-pressed={mode === "free"}
              onClick={() => setMode("free")}
            >
              自由手写
            </button>
          </div>
        </div>
        <p className="logistic-regression-muted-note">
          每条短信先预测一次；η=0.1、20 轮、固定训练数据。更新范围只允许简单算式，不会执行 Python
          或浏览器命令。
        </p>
        {mode === "guided" ? (
          <div className="sgd-guided-controls">
            <label>
              预测 p ={" "}
              <select
                aria-label="预测表达式"
                value={chosen.p}
                onChange={(e) => setChosen({ ...chosen, p: e.target.value })}
              >
                <option>predict(xi)</option>
                <option>yi</option>
              </select>
            </label>
            <label>
              步长 g ={" "}
              <select
                aria-label="步长表达式"
                value={chosen.g}
                onChange={(e) => setChosen({ ...chosen, g: e.target.value })}
              >
                <option>eta * (p - yi)</option>
                <option>p - yi</option>
                <option>eta * (yi - p)</option>
              </select>
            </label>
            <label>
              词权重更新 w[j]{" "}
              <select
                aria-label="更新方向"
                value={chosen.op}
                onChange={(e) => setChosen({ ...chosen, op: e.target.value })}
              >
                <option value="-=">-= 减去梯度</option>
                <option value="+=">+= 加上梯度</option>
              </select>
            </label>
            <label>
              更新量{" "}
              <select
                aria-label="特征乘数"
                value={chosen.delta}
                onChange={(e) => setChosen({ ...chosen, delta: e.target.value })}
              >
                <option>g * xi[j]</option>
                <option>g</option>
                <option>eta * (p - yi) * xi[j]</option>
              </select>
            </label>
            <pre className="sgd-code-preview">{`p = ${chosen.p}\ng = ${chosen.g}\nfor j in range(n):\n    w[j] ${chosen.op} ${chosen.delta}`}</pre>
          </div>
        ) : (
          <>
            <label className="sgd-code-label" htmlFor="sgd-code-editor">
              单条短信的更新代码
            </label>
            <textarea
              id="sgd-code-editor"
              name="sgd-code"
              spellCheck={false}
              rows={7}
              maxLength={2000}
              value={draft.code}
              onChange={(e) => updateCode(e.target.value)}
              aria-describedby="sgd-code-help"
            />
            <p id="sgd-code-help" className="logistic-regression-muted-note">
              可用变量：xi、yi、w、j、n、eta、predict。每条短信只算一次 p；支持 + − × ÷、括号和
              xi[j]、w[j]。不需要写训练轮循环。
            </p>
          </>
        )}
        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            if (mode === "guided") {
              const code = `p = ${chosen.p}\ng = ${chosen.g}\nfor j in range(n):\n    w[j] ${chosen.op} ${chosen.delta}`;
              updateCode(code);
              setExecutedCode(code);
            }
            runCode();
          }}
        >
          运行并检查 20 轮
        </button>
        {parsedErrors.length ? (
          <ul className="sgd-diagnostics" role="alert">
            {parsedErrors.map((error, i) => (
              <li key={`${error.code}-${i}`}>
                {error.line ? `第 ${error.line} 行：` : ""}
                {error.message}
              </li>
            ))}
          </ul>
        ) : null}
        {simulation?.run ? (
          <div className="sgd-run-result" role="status">
            <strong>
              训练损失 {simulation.run.epochsHistory.at(-1)?.trainLoss.toFixed(4)} · 验证损失{" "}
              {simulation.run.epochsHistory.at(-1)?.valLoss.toFixed(4)}
            </strong>
            <p>绿色为参考 SGD，蓝色为你写的更新。让两条线重合，才说明每一步都对上了。</p>
            <LossChartSvg
              history={simulation.run.epochsHistory}
              referenceHistory={reference.epochsHistory}
            />
            <WeightSpectrum
              topSpam={simulation.run.epochsHistory.at(-1)?.topSpam ?? []}
              topHam={simulation.run.epochsHistory.at(-1)?.topHam ?? []}
              trainCount={MAX_SAMPLE_SIZE}
              heading="你的代码学到了哪些词"
            />
          </div>
        ) : null}
      </section>
      <ConceptChecklist prompts={stage.prompts} answers={answers} onSelectCorrect={selectConcept} />
      <JudgeVerdictCard
        summary={summary}
        passed={simulation?.passed ?? passed}
        hasNextStage={false}
      />
      <button
        className="button button-primary"
        disabled={submitting || !simulation}
        onClick={onSubmit}
        type="button"
      >
        {submitting ? "正在判定…" : "提交附加挑战"}
      </button>
    </div>
  );
}
