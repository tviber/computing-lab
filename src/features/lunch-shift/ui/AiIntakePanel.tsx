/**
 * AI intake panel, shared by stage 2 (智能接单, practice orders) and
 * stage 4 (晚餐高峰, hidden orders plus the carried-over priority
 * function). The vendored BGE model runs in the browser and proposes a
 * ticket per order, reporting a similarity and a margin. The student's
 * need_confirm(similarity, margin) — evaluated in the shared Pyodide
 * worker — decides which orders the simulated customer restates.
 * Confirmed orders always record right but stall intake one tick;
 * unconfirmed ones keep the AI's ticket. The submission is normalized
 * rows only — no model, no vectors.
 *
 * The practice stage opens with two hand-checked orders, then plots the
 * whole set on similarity × margin so the student sees where the misses
 * land before writing a threshold. Predictions are cached per order set:
 * editing need_confirm only re-runs Python, not the model.
 */

import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import {
  predictTicket,
  textsToEmbed,
  type TicketPrediction,
  type Vector,
} from "../domain/aiIntake.ts";
import { sameTicket } from "../domain/contracts.ts";
import { checkPriorityTable } from "../domain/priority.ts";
import type {
  AiDraft,
  AiIntakeDraft,
  AiIntakeOrderResult,
  AiOrderResult,
  LunchTestSummary,
} from "../domain/protocol.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { INTAKE_SCENARIO } from "../domain/scenarios.ts";
import { AI_CONFIRM_BUDGET, AI_PASS_CORRECT, AI_SERVED_MIN } from "../domain/stages.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { embedTexts, loadEmbedder, type EmbedInfo, type EmbedProgress } from "./embedRunner.ts";
import { runNeedConfirm, runPriorityTable } from "./pyodideRunner.ts";
import { QUEUE_STARTER, QueueResultView } from "./QueuePanel.tsx";

export const NEED_CONFIRM_STARTER = `def need_confirm(similarity, margin):
    # 先看 AI 裸跑的散点图，再决定哪些单需要请顾客确认。
    # 返回 True 会让接单台停 1 拍。
    return False
`;

type PreviewRow = {
  id: string;
  request: string;
  prediction: TicketPrediction;
  confirmed: boolean;
  correct?: boolean;
};

function ticketText(prediction: TicketPrediction): string {
  const t = prediction.ticket;
  return `${t.item || "?"} · 「${t.note}」 · ${t.table || "?"}号桌 · ${t.urgent ? "加急" : "普通"}`;
}

/** The field dragging the order's confidence down — the one worth a second look. */
function weakestField(prediction: TicketPrediction): string {
  const fields: [string, number][] = [
    ["菜品", prediction.item.margin],
    ["备注", prediction.note.margin],
    ["桌号", prediction.table.margin],
    ["时效", prediction.urgent.margin],
  ];
  fields.sort((a, b) => a[1] - b[1]);
  return fields[0][0];
}

function fmt(score: number): string {
  return score.toFixed(3);
}

type TriageDecision = "direct" | "ask";

const TRIAGE_CASES = [
  {
    id: "P06",
    title: "「想快一点，但不想加钱」",
    draft: "鸡腿饭 · 加蛋 · 7 号桌 · 普通",
    draftNote: "AI 写成了普通，但它没有解释自己有多确定。",
    directTone: "warning",
    askTone: "neutral",
    direct:
      "你赌对了，这次 AI 刚好记对。可它对「加急还是普通」只领先一点点；换一种说法，它就可能把这单记成加急，厨房会把它插到普通单前面。",
    ask: "你让顾客确认了一次。小票没有变，接单台白停了 1 拍。谨慎有成本，但这次的风险确实只差一点点。",
  },
  {
    id: "P10",
    title: "「辣子照旧」",
    draft: "牛肉面 · 少辣 · 6 号桌 · 普通",
    draftNote: "AI 不知道这位顾客平时吃多辣。",
    directTone: "mistake",
    askTone: "success",
    direct:
      "AI 不知道顾客平时怎么吃，只能把「照旧」猜成少辣。厨房照这张票做，顾客收到的会是一碗额外少了辣的面。",
    ask: "顾客确认：照平时做就行，不用特别备注。AI 多加的「少辣」被删掉，小票改成无备注，接单台停 1 拍。",
  },
] as const;

function TriageIntro(props: { orders: { id: string; request: string }[] }) {
  const [decisions, setDecisions] = createSignal<Record<string, TriageDecision>>({});
  const cases = createMemo(() =>
    TRIAGE_CASES.flatMap((item) => {
      const order = props.orders.find((entry) => entry.id === item.id);
      return order ? [{ ...item, request: order.request }] : [];
    }),
  );
  const decide = (id: string, decision: TriageDecision) =>
    setDecisions((current) => ({ ...current, [id]: decision }));

  return (
    <Show when={cases().length >= 2}>
      <section class="lunch-triage">
        <p class="eyebrow">先当一次质检员</p>
        <h2>这两张小票，你会直接出票吗？</h2>
        <p>
          AI
          已经写好草稿，但没有告诉你自己有多确定。先凭顾客的原话判断：直接出票，还是请他再说一遍？
        </p>
        <div class="lunch-triage-grid">
          <For each={cases()}>
            {(item) => (
              <article class="lunch-triage-card">
                <p class="lunch-triage-title">{item.title}</p>
                <blockquote>“{item.request}”</blockquote>
                <div class="lunch-triage-draft">
                  <span>AI 草稿</span>
                  <b>{item.draft}</b>
                  <small>{item.draftNote}</small>
                </div>
                <div class="lunch-triage-actions">
                  <Button
                    aria-pressed={decisions()[item.id] === "direct" ? "true" : "false"}
                    class="button button-secondary"
                    onClick={() => decide(item.id, "direct")}
                    type="button"
                  >
                    直接出票
                  </Button>
                  <Button
                    aria-pressed={decisions()[item.id] === "ask" ? "true" : "false"}
                    class="button button-secondary"
                    onClick={() => decide(item.id, "ask")}
                    type="button"
                  >
                    停 1 拍，问顾客
                  </Button>
                </div>
                <Show when={decisions()[item.id]}>
                  {(decision) => (
                    <p
                      class={`lunch-feedback ${
                        decision() === "ask" ? item.askTone : item.directTone
                      }`}
                      role="status"
                    >
                      {decision() === "ask" ? item.ask : item.direct}
                    </p>
                  )}
                </Show>
              </article>
            )}
          </For>
        </div>
        <Show when={Object.keys(decisions()).length >= 2}>
          <p class="lunch-note">
            这两单都不能放心直接出票。接下来把 12 张单一起交给
            AI，你要写一个函数，替自己挑出该问的单。
          </p>
        </Show>
      </section>
    </Show>
  );
}

function ConfidenceScatter(props: { rows: PreviewRow[]; mode: "raw" | "run" }) {
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const selected = createMemo(() => props.rows.find((row) => row.id === selectedId()) ?? null);
  const geometry = createMemo(() => {
    const rows = props.rows;
    const width = 640;
    const height = 300;
    const left = 64;
    const right = 612;
    const top = 26;
    const bottom = 248;
    const similarities = rows.map((row) => row.prediction.similarity);
    const margins = rows.map((row) => row.prediction.margin);
    const xMin = Math.max(0, Math.min(0.9, Math.floor(Math.min(...similarities) * 20) / 20 - 0.02));
    const xMax = Math.min(1, Math.max(0.98, Math.ceil(Math.max(...similarities) * 20) / 20 + 0.01));
    const yMax = Math.max(0.05, Math.ceil(Math.max(...margins) * 50) / 50 + 0.01);
    const px = (value: number) => left + ((value - xMin) / (xMax - xMin)) * (right - left);
    const py = (value: number) => bottom - (value / yMax) * (bottom - top);
    const xTicks = [0, 1, 2, 3, 4].map((i) => xMin + ((xMax - xMin) * i) / 4);
    const yTicks = [0, 1, 2, 3].map((i) => (yMax * i) / 3);
    return { width, height, left, right, top, bottom, xMin, xMax, yMax, px, py, xTicks, yTicks };
  });

  const pointClass = (row: PreviewRow) => {
    const status = row.correct === false ? "wrong" : row.correct === true ? "right" : "neutral";
    return `lunch-scatter-dot ${status}${row.confirmed ? " confirmed" : ""}`;
  };

  return (
    <figure class="lunch-scatter">
      <svg
        aria-label="订单的 similarity 和 margin 散点图，红点是 AI 记错的订单"
        role="img"
        viewBox={`0 0 ${geometry().width} ${geometry().height}`}
      >
        <For each={geometry().yTicks}>
          {(tick) => (
            <>
              <line
                class="lunch-scatter-grid"
                x1={geometry().left}
                x2={geometry().right}
                y1={geometry().py(tick)}
                y2={geometry().py(tick)}
              />
              <text class="lunch-scatter-tick" x={geometry().left - 10} y={geometry().py(tick) + 4}>
                {tick.toFixed(2)}
              </text>
            </>
          )}
        </For>
        <For each={geometry().xTicks}>
          {(tick) => (
            <>
              <line
                class="lunch-scatter-grid"
                x1={geometry().px(tick)}
                x2={geometry().px(tick)}
                y1={geometry().top}
                y2={geometry().bottom}
              />
              <text
                class="lunch-scatter-tick"
                text-anchor="middle"
                x={geometry().px(tick)}
                y={geometry().bottom + 18}
              >
                {tick.toFixed(2)}
              </text>
            </>
          )}
        </For>
        <line
          class="lunch-scatter-axis"
          x1={geometry().left}
          x2={geometry().right}
          y1={geometry().bottom}
          y2={geometry().bottom}
        />
        <line
          class="lunch-scatter-axis"
          x1={geometry().left}
          x2={geometry().left}
          y1={geometry().top}
          y2={geometry().bottom}
        />
        <text
          class="lunch-scatter-label"
          text-anchor="middle"
          x={(geometry().left + geometry().right) / 2}
          y={geometry().height - 8}
        >
          similarity（越靠右，AI 越像见过这种说法）
        </text>
        <text class="lunch-scatter-label" x={geometry().left - 46} y={geometry().top - 8}>
          margin
        </text>
        <For each={props.rows}>
          {(row) => {
            const x = () => geometry().px(row.prediction.similarity);
            const y = () => geometry().py(row.prediction.margin);
            const labelY = () => (y() < geometry().top + 18 ? y() + 16 : y() - 10);
            const choose = () => setSelectedId(row.id);
            return (
              <g
                aria-label={`${row.id}：${row.request}`}
                class="lunch-scatter-point"
                onClick={choose}
                onFocus={choose}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    choose();
                  }
                }}
                onMouseEnter={choose}
                role="button"
                tabindex={0}
              >
                <Show when={row.confirmed}>
                  <circle class="lunch-scatter-halo" cx={x()} cy={y()} r={12} />
                </Show>
                <circle
                  class={`${pointClass(row)}${selectedId() === row.id ? " selected" : ""}`}
                  cx={x()}
                  cy={y()}
                  r={selectedId() === row.id ? 8 : 6}
                >
                  <title>
                    {row.id}：{row.request}。similarity {fmt(row.prediction.similarity)}，margin{" "}
                    {fmt(row.prediction.margin)}
                    {row.correct === false ? "，AI 记错" : ""}
                    {row.confirmed ? "，已要求确认" : ""}
                  </title>
                </circle>
                <text class="lunch-scatter-id" text-anchor="middle" x={x()} y={labelY()}>
                  {row.id}
                </text>
              </g>
            );
          }}
        </For>
      </svg>
      <figcaption>
        {props.mode === "raw"
          ? "这是 AI 裸跑的结果。红点是它已经猜错的单；先看它们落在哪，再决定 need_confirm 该在哪些分数上拦一下。"
          : "空心圈是你要求确认的单，它们会让接单台多停 1 拍。看看这些圈有没有落在红点附近。"}
      </figcaption>
      <Show when={selected()}>
        {(row) => (
          <div class="lunch-scatter-detail" role="status">
            <p>
              <b>{row().id}</b>
              <span>「{row().request}」</span>
            </p>
            <small>
              AI 小票：{ticketText(row().prediction)} · similarity{" "}
              {fmt(row().prediction.similarity)} · margin {fmt(row().prediction.margin)}
              {row().correct === false ? " · 已猜错" : ""}
              {row().confirmed ? " · 会让接单台停 1 拍" : ""}
            </small>
          </div>
        )}
      </Show>
      <div class="lunch-scatter-legend">
        <span>
          <i class="right" />
          记对
        </span>
        <span>
          <i class="wrong" />
          记错
        </span>
        <span>
          <i class="ring" />
          空心 = 停 1 拍确认
        </span>
      </div>
    </figure>
  );
}

function OrderPreviewTable(props: { rows: PreviewRow[]; showCorrect: boolean; open?: boolean }) {
  return (
    <details class="lunch-reference" open={props.open}>
      <summary>看每一张订单的判断</summary>
      <div class="lunch-table-wrap">
        <table class="lunch-orders-table">
          <thead>
            <tr>
              <th>订单</th>
              <th>顾客说</th>
              <th>AI 记的小票</th>
              <th>similarity</th>
              <th>margin</th>
              <Show when={props.showCorrect}>
                <th>AI 记对</th>
              </Show>
              <th>处理</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr>
                  <td>
                    <b>{row.id}</b>
                  </td>
                  <td>
                    <small>{row.request}</small>
                  </td>
                  <td>{ticketText(row.prediction)}</td>
                  <td>
                    {fmt(row.prediction.similarity)}
                    <br />
                    <small>较弱：{weakestField(row.prediction)}</small>
                  </td>
                  <td>{fmt(row.prediction.margin)}</td>
                  <Show when={props.showCorrect}>
                    <td>{row.correct === false ? "✗" : "✓"}</td>
                  </Show>
                  <td>{row.confirmed ? "再确认 +1 拍" : "直接记"}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function AiIntakePanel<D extends AiIntakeDraft>(props: {
  /** "practice" = stage 2 (public orders, intake only); "final" = stage 4. */
  variant: "practice" | "final";
  draft: D;
  orders: { id: string; request: string }[];
  submitting: boolean;
  result: LunchTestSummary | null;
  onChange: (draft: D) => void;
  onSubmit: () => void;
}) {
  const isFinal = () => props.variant === "final";
  const [modelStatus, setModelStatus] = createSignal<"loading" | "ready" | "error">("loading");
  const [modelInfo, setModelInfo] = createSignal<EmbedInfo | null>(null);
  const [modelError, setModelError] = createSignal<string | null>(null);
  const [progress, setProgress] = createSignal<EmbedProgress | null>(null);
  const [running, setRunning] = createSignal(false);
  const [runNote, setRunNote] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [preview, setPreview] = createSignal<PreviewRow[] | null>(null);
  const [previewMode, setPreviewMode] = createSignal<"raw" | "run" | null>(null);
  const [previewStale, setPreviewStale] = createSignal(false);

  // Model predictions keyed by the order set — an edit to need_confirm
  // or priority does not re-embed 300+ texts, so a rerun is Python-fast.
  let predictionCache: {
    key: string;
    predictions: TicketPrediction[];
  } | null = null;

  const confirmSource = () =>
    props.draft.confirmCode.trim() ? props.draft.confirmCode : NEED_CONFIRM_STARTER;
  const finalDraft = () => props.draft as unknown as AiDraft;
  const queueSource = () =>
    isFinal() ? (finalDraft().queueCode?.trim() ? finalDraft().queueCode : QUEUE_STARTER) : "";
  const ready = () =>
    isFinal()
      ? props.draft.results !== null && finalDraft().priority !== null
      : props.draft.results !== null;

  const intakeResult = () =>
    !isFinal() && props.result?.kind === "ai-intake" ? props.result : null;
  const finalResult = () => (isFinal() && props.result?.kind === "final" ? props.result : null);

  const intakeCaught = () => intakeResult()?.orders?.filter((order) => order.rescued) ?? [];
  const intakeWasted = () =>
    intakeResult()?.orders?.filter((order) => order.confirmed && !order.rescued) ?? [];
  const finalCaught = () => finalResult()?.orders?.filter((order) => order.rescued) ?? [];
  const finalWasted = () =>
    finalResult()?.orders?.filter((order) => order.confirmed && !order.rescued) ?? [];
  const finalStalledLate = () => {
    const result = finalResult();
    if (!result) return [];
    const run = result.run;
    const heldAt = new Map<string, number>();
    for (const event of run?.events ?? []) {
      if (event.action === "held") heldAt.set(event.orderId, event.tick);
    }
    return (result.orders ?? [])
      .filter((order) => order.confirmed && !order.onTime)
      .map((order) => {
        const runOrder = run?.orders.find((entry) => entry.id === order.id);
        return {
          id: order.id,
          table: runOrder?.table,
          heldTick: heldAt.get(order.id),
          delivered: order.delivered,
          wait: order.wait,
        };
      });
  };

  // Start the model download as soon as the stage opens — it's vendored
  // locally and warm by the time the student finishes reading the task.
  createEffect(
    () => 0,
    () => {
      let cancelled = false;
      loadEmbedder(setProgress).then(
        (info) => {
          if (cancelled) return;
          setModelInfo(info);
          setModelStatus("ready");
        },
        (loadError: unknown) => {
          if (cancelled) return;
          setModelError(loadError instanceof Error ? loadError.message : String(loadError));
          setModelStatus("error");
        },
      );
      return () => {
        cancelled = true;
      };
    },
  );

  const predict = async (): Promise<{ predictions: TicketPrediction[]; cached: boolean }> => {
    const orders = props.orders;
    const key = orders.map((order) => `${order.id}${order.request}`).join("");
    if (predictionCache?.key === key) {
      return { predictions: predictionCache.predictions, cached: true };
    }
    const texts = textsToEmbed(orders.map((order) => order.request));
    const { vectors } = await embedTexts(texts);
    const embedOf = (text: string): Vector => vectors[texts.indexOf(text)];
    const predictions = orders.map((order) => predictTicket(order.request, embedOf));
    predictionCache = { key, predictions };
    return { predictions, cached: false };
  };

  const makePreviewRows = (
    predictions: TicketPrediction[],
    confirms?: readonly boolean[],
  ): PreviewRow[] =>
    props.orders.map((order, index) => {
      const prediction = predictions[index];
      const expected = !isFinal()
        ? INTAKE_SCENARIO.orders.find((entry) => entry.id === order.id)?.expected
        : undefined;
      return {
        id: order.id,
        request: order.request,
        prediction,
        confirmed: confirms?.[index] ?? false,
        correct: expected ? sameTicket(prediction.ticket, expected) : undefined,
      };
    });

  const previewRaw = async () => {
    setRunning(true);
    setError(null);
    setRunNote(null);
    try {
      const { predictions } = await predict();
      setPreview(makePreviewRows(predictions));
      setPreviewMode("raw");
      setPreviewStale(false);
      setRunNote("AI 已经读完订单。先看红点落在哪，再写 need_confirm。");
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setRunNote(null);
    try {
      const confirmCode = confirmSource();
      const queueCode = queueSource();
      const orders = props.orders;
      const punct =
        describeFullWidthPunctuation(confirmCode) ??
        (isFinal() ? describeFullWidthPunctuation(queueCode) : null);
      if (punct) throw new Error(punct);
      const { predictions, cached } = await predict();
      const cases: [number, number][] = predictions.map((prediction) => [
        Math.round(prediction.similarity * 10000) / 10000,
        Math.round(prediction.margin * 10000) / 10000,
      ]);
      const rawConfirms = await runNeedConfirm(confirmCode, cases);
      const confirms = Array.isArray(rawConfirms) ? rawConfirms : [];
      if (
        confirms.length !== orders.length ||
        confirms.some((value) => typeof value !== "boolean")
      ) {
        throw new Error("need_confirm 要对每张订单返回 True 或 False。");
      }
      const rows = makePreviewRows(predictions, confirms);
      setPreview(rows);
      setPreviewMode("run");
      setPreviewStale(false);
      const results = rows.map((row) => ({
        id: row.id,
        ticket: row.prediction.ticket,
        confirmed: row.confirmed,
      }));
      if (isFinal()) {
        const priority = checkPriorityTable(await runPriorityTable(queueCode));
        if (priority.errors.length > 0 || priority.table === null) {
          throw new Error(priority.errors[0] ?? "priority 返回的值不完整。");
        }
        props.onChange({
          ...props.draft,
          confirmCode,
          queueCode,
          priority: priority.table,
          results,
        } as D);
      } else {
        props.onChange({ ...props.draft, confirmCode, results });
      }
      setRunNote(cached ? "预测结果已经缓存，这次只重新执行了 need_confirm。" : null);
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section class="lunch-challenge">
      <p>
        {isFinal()
          ? "这一关把接单和排单放在一起跑。先重跑一遍，再提交看完整回放。"
          : "先做两张人工质检，再让 AI 裸跑一遍，最后写 need_confirm 自动化判断。"}
      </p>

      <p class="lunch-note" role="status">
        本地模型 <code>bge-small-zh-v1.5</code>：
        {modelStatus() === "loading"
          ? "加载中…"
          : modelStatus() === "ready"
            ? `已就绪（${modelInfo()?.device === "webgpu" ? "WebGPU" : "WASM"}）`
            : "加载失败"}
        {modelStatus() === "loading" && progress()
          ? ` · 下载 ${Math.round(progress()!.loaded / 1024 / 1024)}/${Math.round(progress()!.total / 1024 / 1024)} MB`
          : null}
      </p>
      <Show when={modelError()}>
        {(err) => (
          <p class="test-error" role="alert">
            {err()}
          </p>
        )}
      </Show>

      <Show when={!isFinal()}>
        <TriageIntro orders={props.orders} />
      </Show>

      <Show when={!isFinal()}>
        <section class="lunch-ai-preview">
          <div class="lunch-ai-preview-head">
            <div>
              <p class="eyebrow">
                {previewMode() === "run" ? "加上你的规则，再看看" : "先看 AI 裸跑"}
              </p>
              <p>
                {previewMode() === "run"
                  ? "空心圈是你要求确认的单。把它们和红点对照，看看有没有白问，或者漏掉真正没把握的单。"
                  : "先让 AI 自己读一遍，不写任何规则。红点是它已经猜错的单。"}
              </p>
            </div>
            <Button
              class="button button-secondary"
              disabled={running() || modelStatus() !== "ready" || props.orders.length === 0}
              onClick={() => void previewRaw()}
              type="button"
            >
              {preview() ? "重看 AI 裸跑" : `让 AI 先读这 ${props.orders.length} 张单`}
            </Button>
          </div>
          <Show
            fallback={
              <p class="lunch-note">
                {modelStatus() === "ready"
                  ? "点上面的按钮，先看 AI 会把哪几张单记错。"
                  : "模型加载完成后，就可以先看 AI 的裸跑结果。"}
              </p>
            }
            when={preview()}
          >
            {(rows) => (
              <>
                <Show when={previewStale()}>
                  <p class="lunch-note" role="status">
                    代码已修改。散点图里仍是上一轮的确认圈，重新运行后会更新。
                  </p>
                </Show>
                <ConfidenceScatter mode={previewMode() === "run" ? "run" : "raw"} rows={rows()} />
                <OrderPreviewTable rows={rows()} showCorrect />
              </>
            )}
          </Show>
        </section>
      </Show>

      <p class="eyebrow">你写的确认规则</p>
      <CodeEditor
        ariaLabel="need_confirm 函数代码"
        disabled={running()}
        onChange={(confirmCode) => {
          props.onChange({ ...props.draft, confirmCode, results: null });
          if (isFinal()) {
            setPreview(null);
            setPreviewMode(null);
          } else {
            setPreviewStale(preview()?.some((row) => row.confirmed) ?? false);
          }
          setRunNote(null);
        }}
        value={confirmSource()}
      />

      <Show when={isFinal()}>
        <p class="eyebrow">厨房排单函数（沿用第三关）</p>
        <CodeEditor
          ariaLabel="priority 函数代码"
          disabled={running()}
          onChange={(queueCode) =>
            props.onChange({ ...props.draft, queueCode, priority: null } as D)
          }
          value={queueSource()}
        />
      </Show>

      <div class="submit-row">
        <Button
          class="button button-secondary"
          disabled={running() || modelStatus() !== "ready" || props.orders.length === 0}
          onClick={() => void run()}
          type="button"
        >
          {running()
            ? "推理中…"
            : isFinal()
              ? `重跑这 ${props.orders.length} 张单`
              : previewMode() === "raw"
                ? `用这版规则跑 ${props.orders.length} 张单`
                : `让 AI 读这 ${props.orders.length} 张单`}
        </Button>
        <Button
          class="button button-primary"
          disabled={props.submitting || !ready()}
          onClick={() => props.onSubmit()}
          type="button"
        >
          {props.submitting ? "判定中…" : isFinal() ? "提交并看回放" : "提交这版确认规则"}
        </Button>
        <Show when={!ready()}>
          <span class="submit-note">
            {isFinal() ? "先重跑接单和排单，再提交看回放。" : "先运行这版 need_confirm，才能提交。"}
          </span>
        </Show>
        <Show when={isFinal()}>
          <span class="submit-note">
            过关线：12 张全对、确认 ≤4 次、记对且准时 ≥11 张。可以多次提交看回放。
          </span>
        </Show>
        <Show when={!isFinal()}>
          <span class="submit-note">过关线：12 张全对，确认不超过 4 次。</span>
        </Show>
      </div>

      <Show when={error()}>
        {(err) => (
          <p class="test-error" role="alert">
            {err()}
          </p>
        )}
      </Show>
      <Show when={runNote()}>{(note) => <p class="lunch-note">{note()}</p>}</Show>

      <Show when={isFinal() ? preview() : null}>
        {(rows) => <OrderPreviewTable open rows={rows()} showCorrect={false} />}
      </Show>

      <Show when={intakeResult()}>
        {(res) => (
          <section class="lunch-result" role="status">
            <p class="eyebrow">练习成绩</p>
            <div class="lunch-stat-row">
              <span>
                <b>
                  {res().correct} / {res().total}
                </b>
                小票正确
              </span>
              <span>
                <b>{res().confirmed}</b>
                次确认（≤{AI_CONFIRM_BUDGET} 次内）
              </span>
            </div>
            <p
              class={
                res().correct === res().total && res().confirmed <= AI_CONFIRM_BUDGET
                  ? "lunch-feedback success"
                  : "lunch-feedback"
              }
            >
              {res().correct === res().total && res().confirmed <= AI_CONFIRM_BUDGET
                ? "过关：AI 记错的单都被你挑出来确认了，确认次数也在 4 次以内。"
                : res().confirmed > AI_CONFIRM_BUDGET
                  ? `你确认了 ${res().confirmed} 次，超过 4 次上限。只在 AI 明显没把握时再问。`
                  : `还有 ${res().total - res().correct} 张单记错了。先看散点图里红点落在哪，再把确认留给那些单。`}
            </p>
            <Show when={intakeCaught().length > 0}>
              <p class="lunch-feedback success">
                你的规则拦下了 AI 的错票：
                {intakeCaught()
                  .map((order) => order.id)
                  .join("、")}
                。
              </p>
            </Show>
            <Show when={intakeWasted().length > 0}>
              <p class="lunch-feedback neutral">
                这些单 AI 本来就记对了，确认多停了 1 拍：
                {intakeWasted()
                  .map((order) => order.id)
                  .join("、")}
                。
              </p>
            </Show>
            <details
              class="lunch-reference"
              open={res().correct !== res().total || res().confirmed > AI_CONFIRM_BUDGET}
            >
              <summary>逐单看结果</summary>
              <div class="lunch-table-wrap">
                <table class="lunch-orders-table">
                  <thead>
                    <tr>
                      <th>订单</th>
                      <th>顾客说</th>
                      <th>最终小票</th>
                      <th>正确小票</th>
                      <th>确认</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={res().orders ?? []}>
                      {(order: AiIntakeOrderResult) => (
                        <tr>
                          <td>
                            <b>{order.id}</b>
                          </td>
                          <td>
                            <small>{order.request}</small>
                          </td>
                          <td>
                            {order.correct ? "✓ " : "✗ "}
                            {`${order.produced.item}·${order.produced.note}·${order.produced.table}号·${order.produced.urgent ? "加急" : "普通"}`}
                          </td>
                          <td>
                            <small>{`${order.expected.item}·${order.expected.note}·${order.expected.table}号·${order.expected.urgent ? "加急" : "普通"}`}</small>
                          </td>
                          <td>{order.confirmed ? "已确认" : "—"}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        )}
      </Show>

      <Show when={finalResult()}>
        {(res) => (
          <section class="lunch-result" role="status">
            <p class="eyebrow">正式成绩</p>
            <div class="lunch-stat-row">
              <span>
                <b>
                  {res().correct} / {res().total}
                </b>
                小票正确
              </span>
              <span>
                <b>{res().confirmed}</b>
                次确认（≤{AI_CONFIRM_BUDGET} 次内）
              </span>
              <span>
                <b>
                  {res().served} / {res().total}
                </b>
                记对且准时
              </span>
            </div>
            <p
              class={
                res().correct >= AI_PASS_CORRECT &&
                res().confirmed <= AI_CONFIRM_BUDGET &&
                res().served >= AI_SERVED_MIN
                  ? "lunch-feedback success"
                  : "lunch-feedback"
              }
            >
              {res().correct >= AI_PASS_CORRECT &&
              res().confirmed <= AI_CONFIRM_BUDGET &&
              res().served >= AI_SERVED_MIN
                ? "过关：接单和高峰排队一起扛住了。"
                : res().correct < AI_PASS_CORRECT
                  ? `还有 ${res().total - res().correct} 张小票记错。把确认留给 AI 真正听错的那几单。`
                  : res().confirmed > AI_CONFIRM_BUDGET
                    ? `你确认了 ${res().confirmed} 次，超过 4 次上限。只在 AI 明显没把握时再问。`
                    : `小票都对了，但只有 ${res().served} 张既记对又准时。先看回放里哪一桌被确认停拍拖慢了，再调整 priority。`}
            </p>

            <Show when={finalCaught().length > 0}>
              <p class="lunch-feedback success">
                你的 need_confirm 拦下了 AI 原本会记错的单：
                {finalCaught()
                  .map((order) => order.id)
                  .join("、")}
                。
              </p>
            </Show>
            <Show when={finalWasted().length > 0}>
              <p class="lunch-feedback neutral">
                这些单 AI 本来就记对了，确认多占了接单台 1 拍：
                {finalWasted()
                  .map((order) => order.id)
                  .join("、")}
                。
              </p>
            </Show>
            <Show when={finalStalledLate().length > 0}>
              <div class="lunch-feedback neutral">
                <strong>确认之后没赶上准时的单</strong>
                <ul class="lunch-late-list">
                  <For each={finalStalledLate()}>
                    {(order) => (
                      <li>
                        <b>{order.id}</b>
                        {order.table ? `（${order.table} 号桌）` : ""}
                        {order.heldTick !== undefined
                          ? ` 在第 ${order.heldTick} 拍停在接单台等顾客确认`
                          : " 在接单台等顾客确认"}
                        {order.delivered === false
                          ? "，最后没送到。"
                          : order.wait !== undefined
                            ? `，送到时已经等了 ${order.wait} 拍。`
                            : "，最后没能准时送到。"}
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>

            <Show when={res().run}>
              {(run) => <QueueResultView autoPlay run={run()} title="晚餐高峰回放" />}
            </Show>

            <details class="lunch-reference">
              <summary>逐单看送达结果</summary>
              <div class="lunch-table-wrap">
                <table class="lunch-orders-table">
                  <thead>
                    <tr>
                      <th>订单</th>
                      <th>小票</th>
                      <th>确认</th>
                      <th>送达</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={res().orders ?? []}>
                      {(order: AiOrderResult) => (
                        <tr>
                          <td>
                            <b>{order.id}</b>
                          </td>
                          <td>{order.correct ? "记对了" : "记错了"}</td>
                          <td>{order.confirmed ? "已确认" : "—"}</td>
                          <td>
                            {order.delivered === false
                              ? "没送到"
                              : order.wait !== undefined
                                ? `送到，等了 ${order.wait} 拍`
                                : order.onTime
                                  ? "准时"
                                  : "超时"}
                          </td>
                          <td>
                            {order.rescued
                              ? order.onTime
                                ? "拦下了 AI 的错票"
                                : "拦下错票，但确认后超时"
                              : order.confirmed && !order.rescued
                                ? "AI 本来记对，确认多停 1 拍"
                                : !order.correct
                                  ? "小票记错"
                                  : order.onTime
                                    ? "记对且准时"
                                    : "记对了，但没准时"}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        )}
      </Show>
    </section>
  );
}
