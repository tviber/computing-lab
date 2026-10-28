/**
 * Stage 4 · 正式挑战: last tuning of the same rule set, then a one-shot
 * graded run against the hidden order set. Once submitted the editor
 * locks and only the recorded result remains.
 */

import { FOCUSES, FOCUS_LABELS } from "../domain/contracts.ts";
import type { ChallengeDraft, LunchTestSummary } from "../domain/protocol.ts";
import { RuleEditor } from "./RuleEditor.tsx";
import { RunResultView } from "./RunResultView.tsx";

export function FinalPanel({
  draft,
  submitting,
  result,
  submitted,
  onChange,
  onSubmit,
}: {
  draft: ChallengeDraft;
  submitting: boolean;
  /** Recorded final test summary — from the judge or project extras. */
  result: LunchTestSummary | null;
  submitted: boolean;
  onChange: (draft: ChallengeDraft) => void;
  onSubmit: () => void;
}) {
  const run = result?.kind === "run" ? result.run : undefined;
  return (
    <section className="lunch-challenge">
      <div>
        <p className="eyebrow">正式挑战 · 只提交一次</p>
        <h2>换了一批订单</h2>
        <p>
          正式挑战的 12
          张订单和练习不同，写法也可能更刁钻。可以最后再调整三站规则——按提交之前的规则判分，提交后不能改。
        </p>
      </div>

      <details className="lunch-reference" open={!submitted && !draft.focus}>
        <summary>登记我的重点站（可选）</summary>
        <label className="field-select">
          你想重点优化哪一站？
          <select
            disabled={submitted}
            onChange={(e) =>
              onChange({
                ...draft,
                focus: e.target.value === "" ? null : (e.target.value as ChallengeDraft["focus"]),
              })
            }
            value={draft.focus ?? ""}
          >
            <option value="">不登记</option>
            {FOCUSES.map((focus) => (
              <option key={focus} value={focus}>
                {FOCUS_LABELS[focus]}
              </option>
            ))}
          </select>
        </label>
      </details>

      <RuleEditor
        blocks={draft.blocks}
        disabled={submitted}
        onChange={(blocks) => onChange({ ...draft, blocks })}
      />

      {submitted ? null : (
        <div className="submit-row">
          <button
            className="button button-primary"
            disabled={submitting}
            onClick={onSubmit}
            type="button"
          >
            {submitting ? "正在判定…" : "提交正式挑战"}
          </button>
          <span className="submit-note">服务器用另一套隐藏订单判定；这是唯一的正式成绩。</span>
        </div>
      )}

      {run ? (
        <RunResultView
          baseline={result?.baseline}
          run={run}
          title="正式成绩"
          trace={result?.trace}
        />
      ) : submitted ? (
        <p className="lunch-note">正式挑战已提交，成绩载入中或可在教师看板查看。</p>
      ) : null}
    </section>
  );
}
