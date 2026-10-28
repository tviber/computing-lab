/**
 * Stage 3 · 规则练习: the three-station rule editor plus recorded practice
 * runs. The judge simulates the 12 public orders server-side and records
 * the score — passing here only means a run was recorded, which is what
 * unlocks the final. Bonus experiments rerun locally and never record.
 */

import { useState } from "react";
import { applyBlockStrategy } from "../domain/blockStrategy.ts";
import { FOCUSES, FOCUS_LABELS, type RunSummary } from "../domain/contracts.ts";
import type { ChallengeDraft, LunchTestSummary } from "../domain/protocol.ts";
import { EXPERIMENTS, PRACTICE_SCENARIO } from "../domain/scenarios.ts";
import { simulate } from "../domain/simulator.ts";
import { RuleEditor } from "./RuleEditor.tsx";
import { RunResultView } from "./RunResultView.tsx";
import { TickNote } from "./TickNote.tsx";

function ExperimentCard({
  label,
  practice,
  result,
  note,
}: {
  label: string;
  practice: RunSummary;
  result: RunSummary;
  note: string;
}) {
  const delta = (result.score ?? 0) - (practice.score ?? 0);
  return (
    <section className="lunch-experiment-card" role="status">
      <p className="eyebrow">对比实验 · {label}</p>
      <p>
        原配置：{practice.score} 分 · 最挤的一站：{FOCUS_LABELS[practice.bottleneck]}
      </p>
      <p>
        <b>
          {label}：{result.score} 分（{delta >= 0 ? "+" : ""}
          {delta}） · 最挤的一站：{FOCUS_LABELS[result.bottleneck]}
        </b>
      </p>
      <p className="lunch-note">{note}实验成绩没有写进记录。</p>
    </section>
  );
}

export function ChallengePanel({
  draft,
  submitting,
  result,
  onChange,
  onSubmit,
}: {
  draft: ChallengeDraft;
  submitting: boolean;
  /** Latest recorded practice test summary — from the judge or project extras. */
  result: LunchTestSummary | null;
  onChange: (draft: ChallengeDraft) => void;
  onSubmit: () => void;
}) {
  const [experiments, setExperiments] = useState<Partial<Record<string, RunSummary>>>({});
  const [runningExperiment, setRunningExperiment] = useState<string | null>(null);
  const run = result?.kind === "run" ? result.run : undefined;

  const runExperiment = (id: string) => {
    const experiment = EXPERIMENTS.find((item) => item.id === id);
    if (!experiment) return;
    setRunningExperiment(id);
    const scenario = { ...PRACTICE_SCENARIO, deliveryTicks: experiment.deliveryTicks };
    const { result: summary } = simulate(
      scenario,
      (ctx) => applyBlockStrategy(ctx, draft.blocks),
      experiment.stoves,
      experiment.intakePerTick,
    );
    setExperiments((prev) => ({ ...prev, [id]: summary }));
    setRunningExperiment(null);
  };

  return (
    <section className="lunch-challenge">
      <div>
        <p className="eyebrow">规则挑战 · 目标 77 分</p>
        <h2>给餐馆定处理规则</h2>
        <p>选一站，把语句接进规则里，试运行就能看到订单的变化。</p>
        <TickNote />
      </div>

      <details className="lunch-reference">
        <summary>登记我的重点站（可选）</summary>
        <label className="field-select">
          你想重点优化哪一站？这里只是登记给老师看，改规则还是用上面的三个按钮。
          <select
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

      <RuleEditor blocks={draft.blocks} onChange={(blocks) => onChange({ ...draft, blocks })} />

      <div className="submit-row">
        <button
          className="button button-primary"
          disabled={submitting}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? "正在试运行…" : run ? "再次试运行并记录" : "试运行 12 张订单"}
        </button>
        <span className="submit-note">试运行由服务器模拟并记录一次成绩，可以反复尝试。</span>
      </div>

      {run ? (
        <RunResultView
          baseline={result?.baseline}
          run={run}
          title="练习成绩"
          trace={result?.trace}
        />
      ) : null}

      {run ? (
        <div className="lunch-experiment-box">
          <p className="eyebrow">加餐实验 · 成绩不记录</p>
          <p className="lunch-note">提前做完可以试：改餐馆的配置，看哪里的拥堵会转移。</p>
          <div className="submit-row">
            {EXPERIMENTS.map((experiment) => (
              <button
                className="button button-secondary"
                disabled={runningExperiment !== null}
                key={experiment.id}
                onClick={() => runExperiment(experiment.id)}
                type="button"
              >
                {runningExperiment === experiment.id ? "正在重跑…" : experiment.label}
              </button>
            ))}
          </div>
          {EXPERIMENTS.map((experiment) => {
            const summary = experiments[experiment.id];
            return summary && run ? (
              <ExperimentCard
                key={experiment.id}
                label={experiment.label}
                note={experiment.note}
                practice={run}
                result={summary}
              />
            ) : null;
          })}
        </div>
      ) : null}
    </section>
  );
}
