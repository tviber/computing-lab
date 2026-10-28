/**
 * Stage 3 · 修排队: the priority(urgent, wait, cook) editor. Tickets are
 * already correct; the browser turns the function into a 124-cell result
 * table and both the local preview and the server simulate by table lookup.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { OrderResult, QueuePick, RunSummary } from "../domain/contracts.ts";
import { checkPriorityTable } from "../domain/priority.ts";
import type { LunchTestSummary, QueueDraft } from "../domain/protocol.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { EXPERIMENTS, QUEUE_SCENARIO, RUSH_SCENARIO } from "../domain/scenarios.ts";
import { simulate } from "../domain/simulator.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { runPriorityTable } from "./pyodideRunner.ts";
import { SimMap } from "./SimMap.tsx";

export const QUEUE_STARTER = `def priority(urgent, wait, cook):
    # 返回的数越大越先做；一样大就先来先做
    # urgent: 加急为 True，普通为 False
    # wait: 这张单已经等了几拍（0～30）
    # cook: 制作要几拍（1 或 3）
    score = 0
    if urgent:
        score = 0      # 加急单给多少分？
    return score
`;

const STAGE_LABEL = { kitchen: "厨房", delivery: "出餐" } as const;

function waitLimit(order: OrderResult): number {
  return order.expected?.urgent ? 9 : 18;
}

function PickRow({ pick }: { pick: QueuePick }) {
  return (
    <li>
      第 {pick.tick} 拍 · {STAGE_LABEL[pick.stage]}：
      {pick.candidates
        .map((c) => {
          const who = `${c.id}（${c.urgent ? "加急" : "普通"}，等 ${c.waitTicks} 拍）`;
          return c.value === null ? who : `${who} → 你的函数算出 ${c.value}`;
        })
        .join("；")}
      ；选 <b>{pick.picked}</b>
    </li>
  );
}

function LateOrders({ run }: { run: RunSummary }) {
  const late = run.orders.filter((order) => !order.onTime);
  if (late.length === 0) {
    return <p className="lunch-feedback success">12 张订单全部准时送达。</p>;
  }
  return (
    <ul className="lunch-late-list">
      {late.map((order) => (
        <li key={order.id}>
          <b>{order.id}</b>（{order.expected?.urgent ? "加急" : "普通"}）
          {order.delivered
            ? `等了 ${order.wait} 拍——上限 ${waitLimit(order)} 拍`
            : `到第 30 拍还没送出去——上限 ${waitLimit(order)} 拍`}
        </li>
      ))}
    </ul>
  );
}

function Replay({ run }: { run: RunSummary }) {
  const events = run.events ?? [];
  const duration = events.length ? Math.max(...events.map((event) => event.tick)) : 0;
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || duration === 0) return;
    const timer = window.setInterval(
      () =>
        setTick((current) => {
          if (current >= duration) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        }),
      480,
    );
    return () => window.clearInterval(timer);
  }, [playing, duration]);
  return (
    <div className="lunch-replay">
      <SimMap run={run} tick={tick} />
      <div className="lunch-replay-controls">
        <button
          className="button button-secondary"
          onClick={() => setPlaying((v) => !v)}
          type="button"
        >
          {playing ? "暂停" : "播放"}
        </button>
        <label className="lunch-replay-range">
          时间轴
          <input
            aria-label="订单回放时间轴"
            max={duration}
            min={0}
            onChange={(e) => {
              setPlaying(false);
              setTick(Number(e.currentTarget.value) || 0);
            }}
            type="range"
            value={tick}
          />
        </label>
        <strong aria-live="polite">
          {tick ? `第 ${tick} 拍 / ${duration} 拍` : `共 ${duration} 拍`}
        </strong>
      </div>
    </div>
  );
}

export function QueueResultView({ run, title }: { run: RunSummary; title: string }) {
  const picks = run.picks ?? [];
  return (
    <section className="lunch-result" role="status">
      <p className="eyebrow">{title}</p>
      <div className="lunch-stat-row" aria-label="本轮关键指标">
        <span>
          <b>
            {run.onTime} / {run.orders.length}
          </b>
          准时送达{run.onTime === run.orders.length ? " ★" : ""}
        </span>
        <span>
          <b>
            {run.delivered} / {run.orders.length}
          </b>
          实际送达
        </span>
      </div>
      <LateOrders run={run} />
      {picks.length > 0 ? (
        <details className="lunch-pick-table" open={run.onTime < run.orders.length}>
          <summary>每一拍怎么选的</summary>
          <ul>
            {picks.map((pick, index) => (
              <PickRow key={`${pick.stage}-${pick.tick}-${index}`} pick={pick} />
            ))}
          </ul>
        </details>
      ) : null}
      <details>
        <summary>回放这一轮</summary>
        <Replay run={run} />
      </details>
    </section>
  );
}

export function QueuePanel({
  draft,
  submitting,
  result,
  passed,
  onChange,
  onSubmit,
}: {
  draft: QueueDraft;
  submitting: boolean;
  result: LunchTestSummary | null;
  passed: boolean;
  onChange: (draft: QueueDraft) => void;
  onSubmit: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tableErrors, setTableErrors] = useState<string[]>([]);
  const [localRun, setLocalRun] = useState<RunSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [experiments, setExperiments] = useState<Record<string, RunSummary>>({});
  const [rushRun, setRushRun] = useState<RunSummary | null>(null);
  const baselineRef = useRef<RunSummary | null>(null);

  const source = draft.code.trim() ? draft.code : QUEUE_STARTER;
  const judgedRun = result?.kind === "queue" ? (result.run ?? null) : null;
  const judgedErrors = result?.kind === "queue" ? (result.errors ?? []) : [];
  // The newest local preview wins; the recorded grade shows only until a
  // fresh run replaces it.
  const shownRun = localRun ?? judgedRun;

  const priority = draft.priority;

  const run = async () => {
    setRunning(true);
    setError(null);
    setTableErrors([]);
    try {
      const punct = describeFullWidthPunctuation(source);
      if (punct) throw new Error(punct);
      const raw = await runPriorityTable(source);
      const { table, errors } = checkPriorityTable(raw);
      if (errors.length > 0 || table === null) {
        setTableErrors(errors);
        return;
      }
      onChange({ code: source, priority: table });
      setLocalRun(simulate(QUEUE_SCENARIO, { priority: table }).result);
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  // One FIFO baseline for the pass-state comparison line.
  useEffect(() => {
    if (passed && baselineRef.current === null) {
      baselineRef.current = simulate(QUEUE_SCENARIO, { priority: null }).result;
    }
  }, [passed]);

  const extraArea = useMemo(() => {
    if (!passed || priority === null) return null;
    return { priority };
  }, [passed, priority]);

  const runExperiment = (id: string) => {
    const experiment = EXPERIMENTS.find((item) => item.id === id);
    if (!experiment || priority === null) return;
    const scenario = { ...QUEUE_SCENARIO, deliveryTicks: experiment.deliveryTicks };
    const { result: summary } = simulate(
      scenario,
      { priority },
      experiment.stoves,
      experiment.intakePerTick,
    );
    setExperiments((prev) => ({ ...prev, [id]: summary }));
  };

  return (
    <section className="lunch-challenge">
      <p>
        这一关 12 张小票全部录对了，要管的只有顺序。每拍系统都问
        <code>priority(urgent, wait, cook)</code> 该先做哪张——返回值最大的先处理。
      </p>
      <details className="lunch-reference">
        <summary>看这 12 张订单</summary>
        <div className="lunch-table-wrap">
          <table className="lunch-orders-table">
            <thead>
              <tr>
                <th>订单</th>
                <th>到达拍</th>
                <th>小票</th>
                <th>制作</th>
              </tr>
            </thead>
            <tbody>
              {QUEUE_SCENARIO.orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <b>{order.id}</b>
                  </td>
                  <td>第 {order.arrivalTick} 拍</td>
                  <td>
                    {order.expected?.table} 号桌 · {order.expected?.item} · 「{order.expected?.note}
                    」 · {order.expected?.urgent ? "加急" : "普通"}
                  </td>
                  <td>{order.cookTicks} 拍</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <CodeEditor
        ariaLabel="priority 函数代码"
        onChange={(code) => onChange({ code, priority: null })}
        value={source}
      />
      <div className="submit-row">
        <button
          className="button button-secondary"
          disabled={running}
          onClick={() => void run()}
          type="button"
        >
          {running ? "运行中…" : "运行，模拟一轮"}
        </button>
        <button
          className="button button-primary"
          disabled={submitting || priority === null}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? "判定中…" : "交服务器判分"}
        </button>
        {priority === null ? (
          <span className="submit-note">先运行一遍，用算出的结果表判分。</span>
        ) : null}
      </div>
      {error ? (
        <p className="test-error" role="alert">
          {error}
        </p>
      ) : null}
      {tableErrors.length > 0 || judgedErrors.length > 0 ? (
        <ul className="lunch-order-fix" role="alert">
          {[...judgedErrors, ...tableErrors].map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : null}
      {shownRun ? <QueueResultView run={shownRun} title="这一轮的成绩" /> : null}

      {extraArea ? (
        <div className="lunch-experiment-box">
          <p className="eyebrow">加练区 · 成绩不记录</p>
          <div className="submit-row">
            {EXPERIMENTS.map((experiment) => (
              <button
                className="button button-secondary"
                key={experiment.id}
                onClick={() => runExperiment(experiment.id)}
                type="button"
              >
                {experiment.label}
              </button>
            ))}
            <button
              className="button button-secondary"
              onClick={() => setRushRun(simulate(RUSH_SCENARIO, { priority }).result)}
              type="button"
            >
              晚高峰 20 单
            </button>
          </div>
          {EXPERIMENTS.map((experiment) => {
            const summary = experiments[experiment.id];
            return summary ? (
              <section className="lunch-experiment-card" key={experiment.id} role="status">
                <p>
                  <b>{experiment.label}</b>：准时 {summary.onTime} / {summary.orders.length}
                </p>
                <p className="lunch-note">{experiment.note}</p>
              </section>
            ) : null;
          })}
          {rushRun ? <QueueResultView run={rushRun} title="晚高峰 20 单" /> : null}
        </div>
      ) : null}
    </section>
  );
}
