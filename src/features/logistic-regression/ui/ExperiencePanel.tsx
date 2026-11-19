import { useId, useMemo, useState } from "react";
import { createExperienceClassifier, EXPERIENCE_EXAMPLES } from "../domain/experience.ts";
import type { ExperienceSubmission, TrainingSettings } from "../domain/protocol.ts";
import { MessageProbeCard } from "./MessageProbeCard.tsx";

export function ExperiencePanel({
  training,
  hasSubmittedModel,
  onComplete,
  onReviewTraining,
  passed,
  submitting,
}: {
  training: TrainingSettings;
  hasSubmittedModel: boolean;
  onComplete: (submission: ExperienceSubmission) => void;
  onReviewTraining: () => void;
  passed: boolean;
  submitting: boolean;
}) {
  const inputId = useId();
  const [probeText, setProbeText] = useState("");
  const [sampleResult, setSampleResult] = useState<ExperienceSubmission | null>(null);
  const { eta, epochs } = training;
  const { threshold, inspect } = useMemo(
    () => createExperienceClassifier({ eta, epochs }),
    [eta, epochs],
  );
  const text = probeText.trim();
  const inspection = useMemo(() => (text ? inspect(text) : null), [text, inspect]);

  return (
    <section
      aria-label="短信分类体验"
      className="logistic-regression-panel logistic-regression-experience"
    >
      <div className="logistic-regression-panel-head">
        <div>
          <h3>试一条短信</h3>
          <p className="logistic-regression-muted-note">
            选一条例子，或写一条自己的短信。改几个字，再看分类是否变化。
          </p>
        </div>
        <button className="button button-ghost" onClick={onReviewTraining} type="button">
          返回训练模型
        </button>
      </div>
      <p className="logistic-regression-data-guide">
        {hasSubmittedModel ? "第 4 关已通过的模型" : "第 4 关当前模型"} · 学习率 {eta} · {epochs} 轮
        · 系统阈值 {(threshold * 100).toFixed(0)}%
      </p>
      <div aria-label="短信示例" className="logistic-regression-preset-row" role="group">
        {EXPERIENCE_EXAMPLES.map((example) => (
          <button
            aria-pressed={probeText === example.text}
            className={`logistic-regression-chip-btn${probeText === example.text ? " is-active" : ""}`}
            key={example.label}
            onClick={() => {
              setProbeText(example.text);
              setSampleResult({
                activity: "sms-classification",
                exampleId: example.id,
                prediction: inspect(example.text).pred,
              });
            }}
            type="button"
          >
            {example.label}
          </button>
        ))}
      </div>
      <label className="logistic-regression-field-label" htmlFor={inputId}>
        短信内容
      </label>
      <textarea
        className="logistic-regression-text-input logistic-regression-experience-input"
        id={inputId}
        maxLength={240}
        onChange={(event) => setProbeText(event.target.value)}
        placeholder="自写短信只在这个页面处理"
        rows={3}
        value={probeText}
      />
      <div aria-live="polite" className="logistic-regression-experience-result">
        {inspection ? (
          <>
            <strong
              className={`logistic-regression-pill ${inspection.pred === 1 ? "is-danger" : "is-success"}`}
            >
              模型分类：{inspection.pred === 1 ? "垃圾短信" : "正常短信"}
            </strong>
            <span className="logistic-regression-muted-note">
              垃圾短信概率 {(inspection.probability * 100).toFixed(1)}%
            </span>
          </>
        ) : (
          <span className="logistic-regression-muted-note">输入短信后，这里会显示分类结果。</span>
        )}
      </div>
      {inspection ? (
        <details className="logistic-regression-experience-details">
          <summary>查看哪些词影响了分类</summary>
          <MessageProbeCard inspection={inspection} threshold={threshold} />
        </details>
      ) : null}
      {passed ? (
        <p className="stage-takeaway" role="status">
          已完成短信分类体验
        </p>
      ) : (
        <div className="logistic-regression-submit-bar">
          <button
            className="button button-primary"
            disabled={!sampleResult || submitting}
            onClick={() => sampleResult && onComplete(sampleResult)}
            type="button"
          >
            {submitting ? "正在记录…" : "完成体验"}
          </button>
          {!sampleResult ? <span>点击任一示例，试分一次即可记录进度。</span> : null}
        </div>
      )}
    </section>
  );
}
