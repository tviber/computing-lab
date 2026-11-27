/**
 * Stage 3 · 修排队: the priority(urgent, wait, cook) editor. Tickets are
 * already correct; the browser turns the function into a 124-cell result
 * table and both the local preview and the server simulate by table lookup.
 */

import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import type { OrderResult, QueuePick, RunSummary } from "../domain/contracts.ts";
import { checkPriorityTable } from "../domain/priority.ts";
import type { LunchTestSummary, QueueDraft } from "../domain/protocol.ts";
import { pickProbe, QUEUE_PROBES } from "../domain/queueProbes.ts";
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

type ProbeRow = { id: string; title: string; passed: boolean; picked: number; answer: number };

/** The 12 grading probes: each is one queue snapshot asking "who first?". */
function ProbeResults(props: { probes: ProbeRow[] }) {
  const passedCount = () => props.probes.filter((row) => row.passed).length;
  return (
    <section class="lunch-result" role="status">
      <p class="eyebrow">
        判定点 · 答对 {passedCount()} / {props.probes.length}
      </p>
      <p class="lunch-note">
        每张卡列出按先来后到排好的在等订单。该先做哪张？算算谁剩下的拍数最少（加急 9 拍、普通 18
        拍，减掉已经等的），一样少就先来先做。
      </p>
      <div class="lunch-table-wrap">
        <table class="lunch-orders-table">
          <thead>
            <tr>
              <th>情况</th>
              <th>在等的单（先来后到）</th>
              <th>你的函数选</th>
              <th>该先做</th>
              <th>判定点</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.probes}>
              {(row) => {
                const probe = QUEUE_PROBES.find((item) => item.id === row.id);
                const label = (index: number) => {
                  const c = probe?.candidates[index];
                  return c
                    ? `${index + 1} 号（${c.urgent ? "加急" : "普通"}·等${c.wait}拍·${c.cook}拍菜）`
                    : `${index + 1} 号`;
                };
                return (
                  <tr>
                    <td>{row.title}</td>
                    <td>
                      {probe?.candidates
                        .map((c, i) => `${i + 1} 号${c.urgent ? "加急" : "普通"}(等${c.wait})`)
                        .join("、")}
                    </td>
                    <td>{label(row.picked)}</td>
                    <td>{label(row.answer)}</td>
                    <td>{row.passed ? "✓" : "✗"}</td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function waitLimit(order: OrderResult): number {
  return order.expected?.urgent ? 9 : 18;
}

function PickCard(props: { pick: QueuePick }) {
  return (
    <div class="lunch-pick-card">
      <p class="lunch-pick-head">
        第 {props.pick.tick} 拍 · {STAGE_LABEL[props.pick.stage]} 选单
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
          <For each={props.pick.candidates}>
            {(c) => (
              <tr class={c.id === props.pick.picked ? "picked" : ""}>
                <td>
                  <b>{c.id}</b>
                </td>
                <td>{c.urgent ? "True" : "False"}</td>
                <td>{c.waitTicks}</td>
                <td>{c.cookTicks}</td>
                <td>{c.value ?? "没用到函数"}</td>
                <td>{c.id === props.pick.picked ? "← 先做" : ""}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

function LateOrders(props: { run: RunSummary }) {
  const late = createMemo(() => props.run.orders.filter((order) => !order.onTime));
  // A normal order that kept losing to an urgent one: that's the
  // starvation lesson, and it should be named, not mysterious.
  const starvedBy = (id: string) =>
    (props.run.picks ?? []).some((pick) => {
      const me = pick.candidates.find((c) => c.id === id);
      const winner = pick.candidates.find((c) => c.id === pick.picked);
      // Only queue-jumping counts — an urgent order that had already waited
      // longer is just first-come-first-served.
      return me !== undefined && winner?.urgent === true && winner.waitTicks < me.waitTicks;
    });

  return (
    <Show
      fallback={<p class="lunch-feedback success">12 张订单全部准时送达。</p>}
      when={late().length > 0}
    >
      <ul class="lunch-late-list">
        <For each={late()}>
          {(order) => (
            <li>
              <b>{order.id}</b>（{order.expected?.urgent ? "加急" : "普通"}）
              {order.delivered
                ? `送到时已经等了 ${order.wait} 拍，等满 ${waitLimit(order)} 拍就算超时`
                : `到第 30 拍还没送出去，等满 ${waitLimit(order)} 拍就算超时`}
              {!order.expected?.urgent && starvedBy(order.id) ? "，一直排在加急单后面" : ""}
            </li>
          )}
        </For>
      </ul>
    </Show>
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

function Replay(props: { run: RunSummary }) {
  // The simulation is parallel, but watching several stations at once is
  // unreadable — the replay awaits one event per step instead.
  const events = () => props.run.events ?? [];
  const [step, setStep] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);

  createEffect(
    () => (playing() ? events().length : 0),
    (length) => {
      if (length === 0) return;
      const timer = window.setInterval(
        () =>
          setStep((current) => {
            if (current >= length - 1) {
              setPlaying(false);
              return current;
            }
            return current + 1;
          }),
        650,
      );
      return () => window.clearInterval(timer);
    },
  );

  const current = () => events()[step()];
  // Draw only the events revealed so far — otherwise the map would show
  // the rest of the same tick before its caption arrives.
  const viewRun = createMemo(() => ({ ...props.run, events: events().slice(0, step() + 1) }));

  const onSeek = (value: string) => {
    setPlaying(false);
    setStep(Number(value) || 0);
  };

  return (
    <div class="lunch-replay">
      <SimMap run={viewRun()} tick={current()?.tick ?? 0} />
      <p aria-live="polite" class="lunch-replay-caption">
        {current()
          ? `第 ${current()!.tick} 拍 · ${current()!.orderId} ${EVENT_TEXT[current()!.action]}`
          : "——"}
      </p>
      <div class="lunch-replay-controls">
        <Button class="button button-secondary" onClick={() => setPlaying((v) => !v)} type="button">
          {playing() ? "暂停" : "播放"}
        </Button>
        <label class="lunch-replay-range">
          进度
          <input
            aria-label="订单回放进度"
            max={Math.max(events().length - 1, 0)}
            min={0}
            onChange={(e) => onSeek(e.currentTarget.value)}
            onInput={(e) => onSeek(e.currentTarget.value)}
            type="range"
            value={step()}
          />
        </label>
        <strong>{events().length ? `第 ${step() + 1} / ${events().length} 步` : "没有事件"}</strong>
      </div>
    </div>
  );
}

export function QueueResultView(props: { run: RunSummary; title: string }) {
  const picks = () => props.run.picks ?? [];
  return (
    <section class="lunch-result" role="status">
      <p class="eyebrow">{props.title}</p>
      <div aria-label="本轮关键指标" class="lunch-stat-row">
        <span>
          <b>
            {props.run.onTime} / {props.run.orders.length}
          </b>
          准时送达{props.run.onTime === props.run.orders.length ? " ★" : ""}
        </span>
        <span>
          <b>
            {props.run.delivered} / {props.run.orders.length}
          </b>
          实际送达
        </span>
      </div>
      <LateOrders run={props.run} />
      <Show when={picks().length > 0}>
        <details class="lunch-pick-table" open={props.run.onTime < props.run.orders.length}>
          <summary>每一拍怎么选的</summary>
          <div>
            <For each={picks()}>{(pick) => <PickCard pick={pick} />}</For>
          </div>
        </details>
      </Show>
      <details>
        <summary>回放这一轮</summary>
        <Replay run={props.run} />
      </details>
    </section>
  );
}

export function QueuePanel(props: {
  draft: QueueDraft;
  submitting: boolean;
  result: LunchTestSummary | null;
  passed: boolean;
  onChange: (draft: QueueDraft) => void;
  onSubmit: () => void;
}) {
  const [error, setError] = createSignal<string | null>(null);
  const [tableErrors, setTableErrors] = createSignal<string[]>([]);
  const [localRun, setLocalRun] = createSignal<RunSummary | null>(null);
  const [running, setRunning] = createSignal(false);
  const [experiments, setExperiments] = createSignal<Record<string, RunSummary>>({});
  const [rushRun, setRushRun] = createSignal<RunSummary | null>(null);
  const [localProbes, setLocalProbes] = createSignal<ProbeRow[] | null>(null);

  const source = () => (props.draft.code.trim() ? props.draft.code : QUEUE_STARTER);
  const judgedRun = () => (props.result?.kind === "queue" ? (props.result.run ?? null) : null);
  const judgedErrors = () => (props.result?.kind === "queue" ? (props.result.errors ?? []) : []);
  const judgedProbes = () =>
    props.result?.kind === "queue" ? (props.result.probes ?? null) : null;
  // The newest local preview wins; the recorded grade shows only until a
  // fresh run replaces it.
  const shownRun = () => localRun() ?? judgedRun();
  const shownProbes = () => localProbes() ?? judgedProbes();
  const allTableErrors = createMemo(() => [...judgedErrors(), ...tableErrors()]);

  const priority = () => props.draft.priority;

  const run = async () => {
    setRunning(true);
    setError(null);
    setTableErrors([]);
    try {
      const code = source();
      const punct = describeFullWidthPunctuation(code);
      if (punct) throw new Error(punct);
      const raw = await runPriorityTable(code);
      const { table, errors } = checkPriorityTable(raw);
      if (errors.length > 0 || table === null) {
        setTableErrors(errors);
        return;
      }
      props.onChange({ code, priority: table });
      setLocalProbes(
        QUEUE_PROBES.map((probe) => {
          const picked = pickProbe(table, probe);
          return {
            id: probe.id,
            title: probe.title,
            passed: picked === probe.answer,
            picked,
            answer: probe.answer,
          };
        }),
      );
      setLocalRun(simulate(QUEUE_SCENARIO, { priority: table }).result);
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  const extraArea = createMemo(() => {
    const p = priority();
    if (!props.passed || p === null) return null;
    return { priority: p };
  });

  const runExperiment = (id: string) => {
    const experiment = EXPERIMENTS.find((item) => item.id === id);
    const p = priority();
    if (!experiment || p === null) return;
    const scenario = { ...QUEUE_SCENARIO, deliveryTicks: experiment.deliveryTicks };
    const { result: summary } = simulate(
      scenario,
      { priority: p },
      experiment.stoves,
      experiment.intakePerTick,
    );
    setExperiments((prev) => ({ ...prev, [id]: summary }));
  };

  return (
    <section class="lunch-challenge">
      <p>
        厨房和出餐两站每拍都调用同一个 <code>priority(urgent, wait, cook)</code>
        ，哪张单的返回值最大，就先做哪张。用它检查下面的 12 张情况卡，答对 11 张过关。
      </p>
      <div class="lunch-params">
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
      <details class="lunch-reference">
        <summary>看判分用的 12 张情况卡</summary>
        <p class="lunch-note">
          店里的排单规定：谁剩下的拍数最少谁先做（加急剩 9−wait、普通剩 18−wait），一样少就
          先来先做。制作需时这一关不参与排单，列出来只是帮你想象场景。你的函数要把这条规定写 对。
        </p>
        <div class="lunch-table-wrap">
          <table class="lunch-orders-table">
            <thead>
              <tr>
                <th>情况卡</th>
                <th>在等的单（先来后到）</th>
              </tr>
            </thead>
            <tbody>
              <For each={QUEUE_PROBES}>
                {(probe) => (
                  <tr>
                    <td>{probe.title}</td>
                    <td>
                      {probe.candidates
                        .map(
                          (c, i) =>
                            `${i + 1} 号${c.urgent ? "加急" : "普通"}(等${c.wait}拍·${c.cook}拍菜)`,
                        )
                        .join("、")}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </details>
      <details class="lunch-reference">
        <summary>整轮预览的 12 张订单（不计分）</summary>
        <p class="lunch-note">
          到达拍：这张单在系统第几拍进来（拍就是第 1 关那种时间步）。准时 = 加急单等满 9
          拍、普通单等满 18 拍之前送到。
        </p>
        <div class="lunch-table-wrap">
          <table class="lunch-orders-table">
            <thead>
              <tr>
                <th>订单</th>
                <th>到达拍</th>
                <th>小票</th>
                <th>制作</th>
              </tr>
            </thead>
            <tbody>
              <For each={QUEUE_SCENARIO.orders}>
                {(order) => (
                  <tr>
                    <td>
                      <b>{order.id}</b>
                    </td>
                    <td>第 {order.arrivalTick} 拍</td>
                    <td>
                      {order.expected?.table} 号桌 · {order.expected?.item} · 「
                      {order.expected?.note}」 · {order.expected?.urgent ? "加急" : "普通"}
                    </td>
                    <td>需要 {order.cookTicks} 拍</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </details>
      <CodeEditor
        ariaLabel="priority 函数代码"
        disabled={running()}
        onChange={(code) => {
          setLocalRun(null);
          setLocalProbes(null);
          setTableErrors([]);
          props.onChange({ code, priority: null });
        }}
        value={source()}
      />
      <div class="submit-row">
        <Button
          class="button button-secondary"
          disabled={running()}
          onClick={() => void run()}
          type="button"
        >
          {running() ? "运行中…" : "运行，模拟一轮"}
        </Button>
        <Button
          class="button button-primary"
          disabled={props.submitting || priority() === null}
          onClick={() => props.onSubmit()}
          type="button"
        >
          {props.submitting ? "判定中…" : "提交判分"}
        </Button>
        <Show when={priority() === null}>
          <span class="submit-note">还没有算出的结果表。</span>
        </Show>
      </div>
      <Show when={error()}>
        {(err) => (
          <p class="test-error" role="alert">
            {err()}
          </p>
        )}
      </Show>
      <Show when={allTableErrors().length > 0}>
        <ul class="lunch-order-fix" role="alert">
          <For each={allTableErrors()}>{(text) => <li>{text}</li>}</For>
        </ul>
      </Show>
      <Show when={shownProbes()}>{(probes) => <ProbeResults probes={probes()} />}</Show>
      <Show when={shownRun()}>
        {(r) => <QueueResultView run={r()} title="整轮预览（不计分）" />}
      </Show>

      <Show when={extraArea()}>
        {(extra) => (
          <div class="lunch-experiment-box">
            <h2 class="lunch-extra-title">进行更多测试</h2>
            <p class="lunch-note">成绩不记录，做完可以继续改函数再测。</p>
            <div class="submit-row">
              <For each={EXPERIMENTS}>
                {(experiment) => (
                  <Button
                    class="button button-secondary"
                    onClick={() => runExperiment(experiment.id)}
                    type="button"
                  >
                    {experiment.label}
                  </Button>
                )}
              </For>
              <Button
                class="button button-secondary"
                onClick={() =>
                  setRushRun(simulate(RUSH_SCENARIO, { priority: extra().priority }).result)
                }
                type="button"
              >
                晚高峰 20 单
              </Button>
            </div>
            <p class="lunch-note">
              晚高峰换成 20 单，你的函数还管用吗？试试把 cook 参数用上，做得快的单先做说不定更划算。
            </p>
            <For each={EXPERIMENTS}>
              {(experiment) => (
                <Show when={experiments()[experiment.id]}>
                  {(summary) => (
                    <section class="lunch-experiment-card" role="status">
                      <p>
                        <b>{experiment.label}</b>：准时 {summary().onTime} /{" "}
                        {summary().orders.length}
                        {shownRun()
                          ? `（本关 ${shownRun()!.onTime} / ${shownRun()!.orders.length}）`
                          : ""}
                      </p>
                      <p class="lunch-note">{experiment.note}</p>
                    </section>
                  )}
                </Show>
              )}
            </For>
            <Show when={rushRun()}>
              {(r) => <QueueResultView run={r()} title="晚高峰 20 单" />}
            </Show>
          </div>
        )}
      </Show>
    </section>
  );
}
