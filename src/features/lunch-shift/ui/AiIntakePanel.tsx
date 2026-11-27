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
 * Predictions are cached per order set: re-running after an edit to
 * need_confirm only re-evaluates the Python function, not the model —
 * the classroom feedback loop stays near-instant.
 */

import { Button } from "@ui-sdk/solid/button";
import { createEffect, createSignal, For, Show } from "solid-js";
import {
  predictTicket,
  textsToEmbed,
  type TicketPrediction,
  type Vector,
} from "../domain/aiIntake.ts";
import { checkPriorityTable } from "../domain/priority.ts";
import type {
  AiDraft,
  AiIntakeDraft,
  AiIntakeOrderResult,
  AiOrderResult,
  LunchTestSummary,
} from "../domain/protocol.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { AI_CONFIRM_BUDGET, AI_PASS_CORRECT, AI_SERVED_MIN } from "../domain/stages.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { embedTexts, loadEmbedder, type EmbedInfo, type EmbedProgress } from "./embedRunner.ts";
import { runNeedConfirm, runPriorityTable } from "./pyodideRunner.ts";
import { QUEUE_STARTER } from "./QueuePanel.tsx";

export const NEED_CONFIRM_STARTER = `def need_confirm(similarity, margin):
    if similarity < 0.85:
        return True
    if margin < 0.10:
        return True
    return False
`;

type PreviewRow = {
  id: string;
  request: string;
  prediction: TicketPrediction;
  confirmed: boolean;
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
      const rows = orders.map((order, index) => ({
        id: order.id,
        request: order.request,
        prediction: predictions[index],
        confirmed: confirms[index],
      }));
      setPreview(rows);
      const results = rows.map((row) => ({
        id: row.id,
        ticket: row.prediction.ticket,
        confirmed: row.confirmed,
      }));
      if (isFinal()) {
        const priority = checkPriorityTable(await runPriorityTable(queueCode));
        if (priority.errors.length > 0 || priority.table === null) {
          throw new Error(priority.errors[0] ?? "priority 结果表不合法");
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
      setRunNote(cached ? "只用了缓存的预测，很快吧。" : null);
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  const passText = () =>
    isFinal()
      ? `${AI_PASS_CORRECT} 张小票全对、确认 ≤${AI_CONFIRM_BUDGET} 次、记对且准时 ≥${AI_SERVED_MIN} 张过关`
      : `${AI_PASS_CORRECT} 张小票全对、确认 ≤${AI_CONFIRM_BUDGET} 次过关`;

  return (
    <section class="lunch-challenge">
      <p>
        AI 接单模型就在浏览器里跑，不上服务器。它给每张订单记一张小票，并报告{" "}
        <code>similarity</code>（最有把握的候选有多像）和 <code>margin</code>
        （第一名领先第二名多少）。你的 need_confirm 决定哪几单让顾客再确认一遍，确认必对，但接单台停
        1 拍。{passText()}。
      </p>

      <p class="lunch-note" role="status">
        模型 <code>bge-small-zh-v1.5</code>：
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

      <p class="eyebrow">决定要不要确认的函数</p>
      <CodeEditor
        ariaLabel="need_confirm 函数代码"
        disabled={running()}
        onChange={(confirmCode) => props.onChange({ ...props.draft, confirmCode, results: null })}
        value={confirmSource()}
      />

      <Show when={isFinal()}>
        <p class="eyebrow">排队的函数（沿用第三关，照样跑正式订单）</p>
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
          {running() ? "推理中…" : "运行，听 12 张订单"}
        </Button>
        <Button
          class="button button-primary"
          disabled={props.submitting || !ready()}
          onClick={() => props.onSubmit()}
          type="button"
        >
          {props.submitting ? "判定中…" : isFinal() ? "提交晚餐高峰" : "提交智能接单"}
        </Button>
        <Show when={!ready()}>
          <span class="submit-note">还没有运行结果，先运行一次。</span>
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

      <Show when={preview()}>
        {(rows) => (
          <div class="lunch-table-wrap">
            <table class="lunch-orders-table">
              <thead>
                <tr>
                  <th>订单</th>
                  <th>顾客说</th>
                  <th>AI 记的小票</th>
                  <th>similarity</th>
                  <th>margin</th>
                  <th>处理</th>
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>
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
                      <td>{row.confirmed ? "再确认 +1 拍" : "直接记"}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        )}
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
                ? "过关：AI 记错的你都挑出来再确认了，预算也没超。"
                : res().confirmed > AI_CONFIRM_BUDGET
                  ? `确认 ${res().confirmed} 次超了 ${AI_CONFIRM_BUDGET} 次上限，只挑最没把握的问。`
                  : `记错 ${res().total - res().correct} 张——把确认留给 AI 真正听错的那几单。`}
            </p>
            <div class="lunch-table-wrap">
              <table class="lunch-orders-table">
                <thead>
                  <tr>
                    <th>订单</th>
                    <th>顾客说</th>
                    <th>记的小票</th>
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
                  ? `记错 ${res().total - res().correct} 张，把确认留给 AI 真正听错的那几单。`
                  : res().confirmed > AI_CONFIRM_BUDGET
                    ? `确认 ${res().confirmed} 次超了 ${AI_CONFIRM_BUDGET} 次上限，只挑最没把握的问。`
                    : `小票都对了但只 ${res().served} 张记对且准时，确认停拍拖慢了出餐，把确认再省一点，或让 priority 多拉等太久的单。`}
            </p>
            <div class="lunch-table-wrap">
              <table class="lunch-orders-table">
                <thead>
                  <tr>
                    <th>订单</th>
                    <th>小票</th>
                    <th>确认</th>
                    <th>送达</th>
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
                        <td>{order.onTime ? "记对且准时" : "没算分"}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Show>
    </section>
  );
}
