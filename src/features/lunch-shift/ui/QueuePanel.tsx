/**
 * Stage 3 · 修排队: the priority(urgent, wait, cook) editor. Tickets are
 * already correct; the browser turns the function into a 124-cell result
 * table and both the local preview and the server simulate by table lookup.
 */

import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Disclosure } from "../../../shared/ui/Disclosure";
import { Icon } from "../../../shared/ui/Icon";
import { LabeledSlider } from "../../../shared/ui/LabeledSlider";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
import type { OrderResult, QueuePick, RunSummary, SimulationEvent } from "../domain/contracts.ts";
import { checkPriorityTable, priorityIndex, PRIORITY_TABLE_SIZE } from "../domain/priority.ts";
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
    # urgent: 是不是加急单（True / False）
    # wait: 已经等了几拍（0～30）
    # cook: 做完要几拍（1 或 3）
    score = 0
    if urgent:
        score = 0      # 加急单该给多少分？
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
        抽检结果 · 答对 {passedCount()} / {props.probes.length}
      </p>
      <p class="lunch-note">
        每张卡列出正在等餐的订单，顺序是先来后到。运行后会显示你的函数选了哪张、按等待上限该选哪张；一样急时保持先来后到。
      </p>
      <div class="lunch-table-wrap">
        <table class="lunch-orders-table">
          <thead>
            <tr>
              <th>情况</th>
              <th>在等的单（先来后到）</th>
              <th>你的函数选</th>
              <th>该先做</th>
              <th>结果</th>
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
                    <td>
                      <Icon name={row.passed ? "check" : "x"} size={12} />
                    </td>
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
  return (order.expected?.urgent ?? order.urgent) ? 9 : 18;
}

function presetTable(kind: "fifo" | "urgent"): number[] {
  const table = new Array<number>(PRIORITY_TABLE_SIZE).fill(0);
  if (kind === "fifo") return table;
  for (const urgent of [false, true]) {
    for (let wait = 0; wait <= 30; wait++) {
      for (const cook of [1, 3] as const) {
        table[priorityIndex(urgent, wait, cook)] = urgent ? 1 : 0;
      }
    }
  }
  return table;
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
              <b>{order.id}</b>（{(order.expected?.urgent ?? order.urgent) ? "加急" : "普通"}）
              {order.delivered
                ? `送到时已经等了 ${order.wait} 拍，等待上限是 ${waitLimit(order)} 拍`
                : `到第 30 拍还没送出去，等待上限是 ${waitLimit(order)} 拍`}
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

function Replay(props: { run: RunSummary; autoPlay?: boolean }) {
  // The simulation is parallel, but watching several stations at once is
  // unreadable — the replay advances one tick at a time and shows every
  // station action that happened on that tick.
  const events = () => props.run.events ?? [];
  const frames = createMemo(() => {
    const byTick = new Map<number, SimulationEvent[]>();
    for (const event of events()) {
      const list = byTick.get(event.tick);
      if (list) list.push(event);
      else byTick.set(event.tick, [event]);
    }
    return [...byTick.entries()]
      .sort(([left], [right]) => left - right)
      .map(([tick, frameEvents]) => ({ tick, events: frameEvents }));
  });
  const [step, setStep] = createSignal(0);
  const [playing, setPlaying] = createSignal(Boolean(props.autoPlay));

  createEffect(
    () => props.run,
    () => {
      setStep(0);
      setPlaying(Boolean(props.autoPlay));
    },
  );

  createEffect(
    () => (playing() ? frames().length : 0),
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
        420,
      );
      return () => window.clearInterval(timer);
    },
  );

  const current = () => frames()[step()];
  const lastTick = () => current()?.tick ?? 0;
  // Draw only the ticks revealed so far, so the map never gets ahead of
  // the caption.
  const viewRun = createMemo(() => ({
    ...props.run,
    events: events().filter((event) => event.tick <= lastTick()),
  }));
  const caption = () => {
    const frame = current();
    if (!frame) return "——";
    const details = frame.events.map((event) => `${event.orderId} ${EVENT_TEXT[event.action]}`);
    const shown = details.slice(0, 2).join("；");
    return `第 ${frame.tick} 拍 · ${shown}${details.length > 2 ? `；另有 ${details.length - 2} 件事` : ""}`;
  };

  const onSeek = (value: string) => {
    setPlaying(false);
    setStep(Number(value) || 0);
  };
  const atEnd = () => frames().length > 0 && step() >= frames().length - 1;
  const togglePlay = () => {
    if (!playing() && atEnd()) setStep(0);
    setPlaying((value) => !value);
  };

  return (
    <div class="lunch-replay">
      <SimMap run={viewRun()} tick={current()?.tick ?? 0} />
      <p aria-live="polite" class="lunch-replay-caption">
        {caption()}
      </p>
      <div class="lunch-replay-controls">
        <Button class="button button-secondary" onClick={togglePlay} type="button">
          {playing() ? "暂停回放" : atEnd() ? "重播回放" : "播放回放"}
        </Button>
        <LabeledSlider
          class="lunch-replay-range"
          label="进度"
          max={Math.max(frames().length - 1, 0)}
          min={0}
          onChange={(next) => onSeek(String(next))}
          step={1}
          value={step()}
          valueText={`${step() + 1} / ${Math.max(frames().length, 1)} 帧`}
        />
        <strong>
          {current()
            ? `第 ${current()!.tick} 拍 · ${step() + 1} / ${frames().length} 帧`
            : frames().length
              ? `第 1 / ${frames().length} 帧`
              : "没有事件"}
        </strong>
      </div>
    </div>
  );
}

export function QueueResultView(props: { run: RunSummary; title: string; autoPlay?: boolean }) {
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
      <Replay autoPlay={props.autoPlay} run={props.run} />
      <Show when={picks().length > 0}>
        <Disclosure class="lunch-pick-table" summary="每一拍怎么选的">
          <div>
            <For each={picks()}>{(pick) => <PickCard pick={pick} />}</For>
          </div>
        </Disclosure>
      </Show>
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
  const [presetRuns, setPresetRuns] = createSignal<Partial<Record<"fifo" | "urgent", RunSummary>>>(
    {},
  );
  const [replaySource, setReplaySource] = createSignal<"fifo" | "urgent" | "mine" | null>(null);
  let replayStageEl: HTMLDivElement | undefined;

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
  const probeScore = () => {
    const probes = shownProbes();
    if (!probes || probes.length === 0) return null;
    return `${probes.filter((row) => row.passed).length} / ${probes.length}`;
  };
  const replayRun = () => {
    const id = replaySource();
    if (id === "mine") return shownRun();
    return id ? (presetRuns()[id] ?? null) : null;
  };
  const replayTitle = () => {
    const id = replaySource();
    if (id === "fifo") return "预设：按到店顺序做";
    if (id === "urgent") return "预设：有加急就先做";
    if (id === "mine") {
      const score = probeScore();
      return score ? `我的规则：这一轮回放 · 抽检 ${score}` : "我的规则：这一轮回放";
    }
    return "餐馆回放";
  };
  const showReplay = (id: "fifo" | "urgent" | "mine") => {
    setReplaySource(id);
    window.requestAnimationFrame(() => {
      replayStageEl?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    });
  };

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

  const runPreset = (id: "fifo" | "urgent") => {
    const run = simulate(QUEUE_SCENARIO, { priority: presetTable(id) }).result;
    setPresetRuns((current) => ({ ...current, [id]: run }));
    showReplay(id);
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
        厨房和出餐台每一拍都会调用同一个 <code>priority(urgent, wait, cook)</code>
        ：哪张单的返回值最大，就先做哪张。运行之后，页面会拿 12 个排队瞬间检查你的规则，答对 11
        张过关。
      </p>

      <section class="lunch-demo">
        <p class="eyebrow">先看两种简单排法</p>
        <p>点标签切换同一块餐馆回放。看看这两种做法各自漏掉了谁，再和自己的规则比。</p>
        <SegmentedPicker<"fifo" | "urgent" | "mine" | "">
          label="选择回放来源"
          onChange={(id) => {
            if (id === "mine") showReplay("mine");
            else if (id === "fifo" || id === "urgent") runPreset(id);
          }}
          options={[
            { value: "fifo", label: "按到店顺序做" },
            { value: "urgent", label: "有加急就先做" },
            { value: "mine", label: "我的规则", disabled: !shownRun() },
          ]}
          value={replaySource() ?? ""}
        />
        <Show
          fallback={<p class="lunch-note">先选一种排法，回放会从第一拍开始播放。</p>}
          when={replayRun()}
        >
          {(run) => (
            <div
              class="lunch-replay-stage"
              ref={(element) => {
                replayStageEl = element;
              }}
            >
              <QueueResultView autoPlay run={run()} title={replayTitle()} />
            </div>
          )}
        </Show>
      </section>

      <p class="eyebrow">你写的排单规则</p>
      <div class="lunch-params">
        <ul>
          <li>
            <code>urgent</code>：这张小票是不是加急单（True 或 False）。
          </li>
          <li>
            <code>wait</code>：这张单已经等了几拍，是 0～30 的整数。
          </li>
          <li>
            <code>cook</code>：做完这张单要几拍，只会是 1 或
            3。这一关不强制使用它，但你可以把它写进规则。
          </li>
          <li>函数返回一个数，越大越先做；两个数一样大时，先来先做。</li>
        </ul>
      </div>
      <Disclosure class="lunch-reference" summary="看抽检用的 12 个排队瞬间">
        <p class="lunch-note">
          每张卡列出几张同时在等的订单，顺序是先来后到。卡片只给场景，不给答案；运行后你会看到自己的函数选了谁、按等待上限又该选谁。
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
      </Disclosure>
      <Disclosure class="lunch-reference" summary="这一轮要跑的 12 张订单（不计分）">
        <p class="lunch-note">
          到达拍表示这张单在系统第几拍进来。拍就是第 1 关里那种时间步。加急单最多等 9
          拍，普通单最多等 18 拍，超过就会超时。
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
      </Disclosure>
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
          {running() ? "运行中…" : "用这版 priority 跑一轮"}
        </Button>
        <Button
          class="button button-primary"
          disabled={props.submitting || priority() === null}
          onClick={() => props.onSubmit()}
          type="button"
        >
          {props.submitting ? "判定中…" : "提交这版规则"}
        </Button>
        <Show when={priority() === null}>
          <span class="submit-note">还没有运行 priority，请先跑一轮。</span>
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
        {(r) => <QueueResultView run={r()} title="这一轮的完整结果（不计分）" />}
      </Show>

      <Show when={extraArea()}>
        {(extra) => (
          <div class="lunch-experiment-box">
            <h2 class="lunch-extra-title">更多试跑</h2>
            <p class="lunch-note">这些试跑不会计分，你可以改完函数再回来比较。</p>
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
              晚高峰是 20 张单的一轮试跑，你可以看看这版规则是否还管用。把 cook
              参数用上，做得快的单会更早出餐。
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
