/**
 * Stage 3 · 修排队: the priority(urgent, wait, cook) editor. Tickets are
 * already correct; the browser turns the function into a 124-cell result
 * table and both the local preview and the server simulate by table lookup.
 */

import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Disclosure } from "../../../shared/ui/Disclosure";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
import type { RunSummary } from "../domain/contracts.ts";
import { checkPriorityTable } from "../domain/priority.ts";
import type { LunchTestSummary, QueueDraft } from "../domain/protocol.ts";
import { QUEUE_PROBES } from "../domain/queueProbes.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { EXPERIMENTS, QUEUE_SCENARIO, RUSH_SCENARIO } from "../domain/scenarios.ts";
import { simulate } from "../domain/simulator.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { runPriorityTable } from "./pyodideRunner.ts";
import {
  presetPriorityTable,
  probePassCount,
  probeRowsFromTable,
  type ProbeRow,
} from "./queueModel";
import { QueueProbeResults } from "./QueueProbeResults";
import { QueueResultView } from "./QueueResultView";

export { QueueResultView };

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
    return `${probePassCount(probes)} / ${probes.length}`;
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
      setLocalProbes(probeRowsFromTable(table));
      setLocalRun(simulate(QUEUE_SCENARIO, { priority: table }).result);
      showReplay("mine");
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  const runPreset = (id: "fifo" | "urgent") => {
    const run = simulate(QUEUE_SCENARIO, { priority: presetPriorityTable(id) }).result;
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
                          (candidate, index) =>
                            `${index + 1} 号${candidate.urgent ? "加急" : "普通"}(等${candidate.wait}拍·${candidate.cook}拍菜)`,
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
          if (replaySource() === "mine") setReplaySource(null);
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
      <Show when={shownProbes()}>{(probes) => <QueueProbeResults probes={probes()} />}</Show>

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
              {(run) => <QueueResultView run={run()} title="晚高峰 20 单" />}
            </Show>
          </div>
        )}
      </Show>
    </section>
  );
}
