/**
 * Stage 2 · 认识信息系统: six questions with per-question feedback, then
 * the four-part end-to-end explanation. The judge requires 6/6 plus a
 * valid explanation; attempts are recorded in the draft.
 */

import { useState } from "react";
import type { LunchJudgeResult, SystemCheckDraft } from "../domain/protocol.ts";
import {
  isCorrectAnswer,
  SYSTEM_CHECK_EXPLANATIONS,
  SYSTEM_CHECK_QUESTIONS,
  SYSTEM_EXPLANATION_PARTS,
  SYSTEM_EXPLANATION_REFERENCE,
} from "../domain/systemCheck.ts";

function Reference() {
  return (
    <details className="lunch-reference">
      <summary>需要提示？看看系统的五个组成</summary>
      <p>
        <b>硬件</b>：你的设备、餐馆的服务器
        <br />
        <b>软件</b>：网页、处理规则和服务程序
        <br />
        <b>网络</b>：连接设备
        <br />
        <b>数据</b>：订单、小票和成绩
        <br />
        <b>用户</b>：顾客、学生和教师
      </p>
      <p>顾客提出需求 → 订单和规则经网络送到餐馆的服务器 → 程序处理 → 页面显示结果。</p>
    </details>
  );
}

export function SystemCheckPanel({
  draft,
  passed,
  submitting,
  outcome,
  onChange,
  onSubmit,
}: {
  draft: SystemCheckDraft;
  passed: boolean;
  submitting: boolean;
  outcome: LunchJudgeResult | null;
  onChange: (draft: SystemCheckDraft) => void;
  onSubmit: (draft: SystemCheckDraft) => void;
}) {
  const [index, setIndex] = useState(() => {
    const firstUnsolved = SYSTEM_CHECK_QUESTIONS.findIndex(
      (question) => !isCorrectAnswer(question.id, draft.answers[question.id] ?? ""),
    );
    return firstUnsolved < 0 ? SYSTEM_CHECK_QUESTIONS.length : firstUnsolved;
  });
  const [feedback, setFeedback] = useState<{ answer: string; correct: boolean } | null>(null);
  // Manual validation — native radio `required` popups fired even when the
  // student hadn't touched the form.
  const [missing, setMissing] = useState(false);

  const explanationLines = draft.explanation.split("\n");
  const question = SYSTEM_CHECK_QUESTIONS[index];
  const allAnsweredCorrectly = SYSTEM_CHECK_QUESTIONS.every((q) =>
    isCorrectAnswer(q.id, draft.answers[q.id] ?? ""),
  );

  return (
    <section className="lunch-check">
      {passed ? (
        <div className="lunch-feedback success victory" role="status">
          <strong>✓ 系统检查完成！</strong>
          <span>接下来，试着改变系统的处理规则。</span>
        </div>
      ) : null}
      {draft.attempts > 0 && !passed ? (
        <p className="lunch-note">已检查 {draft.attempts} 次——6 题全对、四步说明都填写才算通过。</p>
      ) : null}

      {index < SYSTEM_CHECK_QUESTIONS.length && question ? (
        <>
          <p className="eyebrow">
            认识信息系统 · {index + 1} / {SYSTEM_CHECK_QUESTIONS.length}
          </p>
          <h2>{question.prompt}</h2>
          <form
            className="lunch-choice-list"
            onSubmit={(event) => {
              event.preventDefault();
              const answer = new FormData(event.currentTarget).get("answer");
              if (typeof answer !== "string") {
                setFeedback(null);
                setMissing(true);
                return;
              }
              setMissing(false);
              const correct = isCorrectAnswer(question.id, answer);
              setFeedback({ answer, correct });
              onChange({
                ...draft,
                answers: { ...draft.answers, [question.id]: answer },
              });
            }}
          >
            {question.options.map((option) => (
              <label className="lunch-choice-card" key={option.value}>
                <input
                  checked={draft.answers[question.id] === option.value}
                  name="answer"
                  onChange={() => {
                    setMissing(false);
                    setFeedback(null);
                    onChange({
                      ...draft,
                      answers: { ...draft.answers, [question.id]: option.value },
                    });
                  }}
                  type="radio"
                  value={option.value}
                />
                <span>{option.label}</span>
              </label>
            ))}
            {missing ? (
              <p className="lunch-feedback neutral" role="status">
                先选一个选项，再点确认。
              </p>
            ) : null}
            {feedback && feedback.answer === (draft.answers[question.id] ?? "") ? (
              <p
                className={`lunch-feedback ${feedback.correct ? "success victory" : "mistake"}`}
                role="status"
              >
                <strong>{feedback.correct ? "✓ 答对了！" : "再想一想"}</strong>
                <span>{SYSTEM_CHECK_EXPLANATIONS[question.id]}</span>
              </p>
            ) : null}
            <div className="submit-row">
              {index > 0 ? (
                <button
                  className="button button-secondary"
                  onClick={() => {
                    setIndex(index - 1);
                    setFeedback(null);
                  }}
                  type="button"
                >
                  上一题
                </button>
              ) : null}
              {feedback?.correct && feedback.answer === draft.answers[question.id] ? (
                <button
                  className="button button-primary"
                  onClick={() => {
                    setIndex(index + 1);
                    setFeedback(null);
                  }}
                  type="button"
                >
                  继续 →
                </button>
              ) : (
                <button className="button button-primary" type="submit">
                  确认答案
                </button>
              )}
            </div>
          </form>
          <Reference />
        </>
      ) : (
        <>
          <p className="eyebrow">最后一步</p>
          <h2>把刚才的订单旅程接起来</h2>
          <p>
            用自己的话说出这条流水线：每一格写一句，写到对应的对象就算对——比如第一格要说出「顾客」。
          </p>
          {passed ? (
            <details className="lunch-reference" open>
              <summary>参考说法</summary>
              <p>{SYSTEM_EXPLANATION_REFERENCE.join(" → ")}</p>
            </details>
          ) : null}
          {outcome && !outcome.passed && outcome.testSummary.kind === "system-check" ? (
            <p className="lunch-feedback mistake" role="alert">
              {outcome.testSummary.missed && outcome.testSummary.missed.length > 0
                ? `还有 ${outcome.testSummary.missed.length} 题没答对`
                : ""}
              {outcome.testSummary.explanationMissed &&
              outcome.testSummary.explanationMissed.length > 0
                ? `「${outcome.testSummary.explanationMissed
                    .map((index) => SYSTEM_EXPLANATION_PARTS[index])
                    .join("」「")}」这几格没有说到对应的对象`
                : outcome.testSummary.explanationOk === false
                  ? "四步说明要四句都写"
                  : ""}
            </p>
          ) : null}
          <form
            className="lunch-explanation"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit({ ...draft, attempts: draft.attempts + 1 });
            }}
          >
            {SYSTEM_EXPLANATION_PARTS.map((label, partIndex) => (
              <label className="field-select" key={label}>
                {label}
                <input
                  className="text-input"
                  maxLength={75}
                  onChange={(e) => {
                    const parts = [...explanationLines];
                    while (parts.length < SYSTEM_EXPLANATION_PARTS.length) parts.push("");
                    parts[partIndex] = e.target.value;
                    onChange({ ...draft, explanation: parts.join("\n") });
                  }}
                  required
                  value={explanationLines[partIndex] ?? ""}
                />
              </label>
            ))}
            <div className="submit-row">
              <button
                className="button button-secondary"
                onClick={() => {
                  setIndex(SYSTEM_CHECK_QUESTIONS.length - 1);
                  setFeedback(null);
                }}
                type="button"
              >
                上一题
              </button>
              <button
                className="button button-primary"
                disabled={submitting || !allAnsweredCorrectly}
                type="submit"
              >
                {submitting ? "检查中…" : "检查我的答案 →"}
              </button>
            </div>
          </form>
          <Reference />
        </>
      )}
    </section>
  );
}
