/**
 * Stage 3 · 修排队: the priority(urgent, wait, cook) editor. Tickets are
 * already correct; the browser turns the function into a 124-cell result
 * table and both the local preview and the server simulate by table lookup.
 */

import { useEffect, useMemo, useState } from "react";
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

function PickCard({ pick }: { pick: QueuePick }) {
  return (
    <div className="lunch-pick-card">
      <p className="lunch-pick-head">
        第 {pick.tick} 拍 · {STAGE_LABEL[pick.stage]} 选单
      </p>
      <table>
        <thead>
          <tr>
            <th>订单</th>
            <th>urgent</th>
            <th>wait</th>
            <th>cook</th>
            <th>priority() 输出</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pick.candidates.map((c) => (
            <tr className={c.id === pick.picked ? "picked" : ""} key={c.id}>
              <td>
                <b>{c.id}</b>
              </td>
              <td>{c.urgent ? "True" : "False"}</td>
              <td>{c.waitTicks}</td>
              <td>{c.cookTicks}</td>
              <td>{c.value ?? "没用到函数"}</td>
              <td>{c.id === pick.picked ? "← 先做" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LateOrders({ run }: { run: RunSummary }) {
  const late = run.orders.filter((order) => !order.onTime);
  if (late.length === 0) {
    return <p className="lunch-feedback success">12 张订单全部准时送达。</p>;
  }
  // A normal order that kept losing to an urgent one: that's the
  // starvation lesson, and it should be named, not mysterious.
  const starvedBy = (id: string) =>
    (run.picks ?? []).some((pick) => {
      const me = pick.candidates.find((c) => c.id === id);
      const winner = pick.candidates.find((c) => c.id === pick.picked);
      // Only queue-jumping counts — an urgent order that had already waited
      // longer is just first-come-first-served.
      return me !== undefined && winner?.urgent === true && winner.waitTicks < me.waitTicks;
    });
  return (
    <ul className="lunch-late-list">
      {late.map((order) => (
        <li key={order.id}>
          <b>{order.id}</b>（{order.expected?.urgent ? "加急" : "普通"}）
          {order.delivered
            ? `送到时已经等了 ${order.wait} 拍，等满 ${waitLimit(order)} 拍就算超时`
            : `到第 30 拍还没送出去，等满 ${waitLimit(order)} 拍就算超时`}
          {!order.expected?.urgent && starvedBy(order.id) ? "，一直排在加急单后面" : ""}
        </li>
      ))}
    </ul>
  );
}

const EVENT_TEXT = {
  arrive: "到达，开始等",
  held: "小票暂缓录入",
  ticket: "小票记好了",
  cook: "厨房开始做",
  ready: "做好了，等送出",
  send: "送达",
} as const;

function Replay({ run }: { run: RunSummary }) {
  // The simulation is parallel, but watching several stations at once is
  // unreadable — the replay awaits one event per step instead.
  const events = run.events ?? [];
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || events.length === 0) return;
    const timer = window.setInterval(
      () =>
        setStep((current) => {
          if (current >= events.length - 1) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        }),
      650,
    );
    return () => window.clearInterval(timer);
  }, [playing, events.length]);
  const current = events[step];
  // Draw only the events revealed so far — otherwise the map would show
  // the rest of the same tick before its caption arrives.
  const viewRun = { ...run, events: events.slice(0, step + 1) };
  return (
    <div className="lunch-replay">
      <SimMap run={viewRun} tick={current?.tick ?? 0} />
      <p className="lunch-replay-caption" aria-live="polite">
        {current
          ? `第 ${current.tick} 拍 · ${current.orderId} ${EVENT_TEXT[current.action]}`
          : "——"}
      </p>
      <div className="lunch-replay-controls">
        <button
          className="button button-secondary"
          onClick={() => setPlaying((v) => !v)}
          type="button"
        >
          {playing ? "暂停" : "播放"}
        </button>
        <label className="lunch-replay-range">
          进度
          <input
            aria-label="订单回放进度"
            max={Math.max(events.length - 1, 0)}
            min={0}
            onChange={(e) => {
              setPlaying(false);
              setStep(Number(e.currentTarget.value) || 0);
            }}
            type="range"
            value={step}
          />
        </label>
        <strong>{events.length ? `第 ${step + 1} / ${events.length} 步` : "没有事件"}</strong>
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
          <div>
            {picks.map((pick, index) => (
              <PickCard key={`${pick.stage}-${pick.tick}-${index}`} pick={pick} />
            ))}
          </div>
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
        厨房和出餐两站每拍都调用同一个 <code>priority(urgent, wait, cook)</code>
        ，哪张单的返回值最大，就先做哪张。
      </p>
      <div className="lunch-params">
        <ul>
          <li>
            <code>urgent</code>：小票上是不是加急单（True 或 False）。
          </li>
          <li>
            <code>wait</code>：这张单已经等了几拍，0～30 的整数。
          </li>
          <li>
            <code>cook</code>：做完这张单要几拍，只会是 1 或 3。
          </li>
          <li>返回一个数，越大越先做；一样大就先来先做。</li>
        </ul>
      </div>
      <details className="lunch-reference">
        <summary>看这 12 张订单</summary>
        <p className="lunch-note">
          到达拍：这张单在系统第几拍进来（拍就是第 1 关那种时间步）。准时 = 加急单等满 9
          拍、普通单等满 18 拍之前送到。
        </p>
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
                  <td>需要 {order.cookTicks} 拍</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <CodeEditor
        ariaLabel="priority 函数代码"
        disabled={running}
        onChange={(code) => {
          setLocalRun(null);
          setTableErrors([]);
          onChange({ code, priority: null });
        }}
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
        {priority === null ? <span className="submit-note">还没有算出的结果表。</span> : null}
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
          <h2 className="lunch-extra-title">进行更多测试</h2>
          <p className="lunch-note">成绩不记录，做完可以继续改函数再测。</p>
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
          <p className="lunch-note">
            晚高峰换成 20 单，你的函数还管用吗？试试把 cook 参数用上，做得快的单先做说不定更划算。
          </p>
          {EXPERIMENTS.map((experiment) => {
            const summary = experiments[experiment.id];
            return summary ? (
              <section className="lunch-experiment-card" key={experiment.id} role="status">
                <p>
                  <b>{experiment.label}</b>：准时 {summary.onTime} / {summary.orders.length}
                  {shownRun ? `（本关 ${shownRun.onTime} / ${shownRun.orders.length}）` : ""}
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
