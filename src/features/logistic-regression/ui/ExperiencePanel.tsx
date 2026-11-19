import { useId, useMemo } from "react";
import {
  MAX_SAMPLE_SIZE,
  selectExperienceThreshold,
  trainLogisticRegression,
} from "../domain/logisticRegression.ts";
import type { ExperienceDraft, TrainingSettings } from "../domain/protocol.ts";
import { inspectMessageWithModel } from "../domain/tokenizer.ts";
import { MessageProbeCard } from "./MessageProbeCard.tsx";

const EXAMPLES = [
  { label: "日常消息", text: "明天下午和同学一起去学校看电影，别忘了带手机！" },
  { label: "促销短信", text: "尊敬的客户，本店年终促销，全场五折，欢迎到店选购！咨询电话 TEL。" },
  { label: "简短广告", text: "限时优惠！免费领取现金红包，回复 TD 退订。" },
];

export function ExperiencePanel({
  draft,
  training,
  hasSubmittedModel,
  onChange,
  onComplete,
  onReviewTraining,
  passed,
  previewOnly,
  submitting,
}: {
  draft: ExperienceDraft;
  training: TrainingSettings;
  hasSubmittedModel: boolean;
  onChange: (draft: ExperienceDraft) => void;
  onComplete: () => void;
  onReviewTraining: () => void;
  passed: boolean;
  previewOnly: boolean;
  submitting: boolean;
}) {
  const inputId = useId();
  const { eta, epochs } = training;
  const { model, threshold } = useMemo(() => {
    const run = trainLogisticRegression({ trainCount: MAX_SAMPLE_SIZE, eta, epochs });
    return {
      model: run.finalModel,
      threshold: selectExperienceThreshold(run.valPredictions),
    };
  }, [eta, epochs]);
  const text = draft.probeText.trim();
  const inspection = useMemo(
    () =>
      text
        ? inspectMessageWithModel(
            text,
            model.weightsByWord,
            model.bias,
            model.vocabSet,
            threshold,
            model.wordToIndex,
          )
        : null,
    [text, model, threshold],
  );
  const updateText = (probeText: string) => onChange({ ...draft, probeText });

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
        {EXAMPLES.map((example) => (
          <button
            aria-pressed={draft.probeText === example.text}
            className={`logistic-regression-chip-btn${draft.probeText === example.text ? " is-active" : ""}`}
            key={example.label}
            onClick={() => updateText(example.text)}
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
        onChange={(event) => updateText(event.target.value)}
        placeholder="请输入不含姓名、电话号码等个人信息的短信"
        rows={3}
        value={draft.probeText}
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
      ) : previewOnly ? null : (
        <div className="logistic-regression-submit-bar">
          <button
            className="button button-primary"
            disabled={!inspection || submitting}
            onClick={onComplete}
            type="button"
          >
            {submitting ? "正在记录…" : "完成体验"}
          </button>
        </div>
      )}
    </section>
  );
}
