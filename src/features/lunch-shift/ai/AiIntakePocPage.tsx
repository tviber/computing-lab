/**
 * 智能接单 PoC — dev-only proof of concept for the 「AI 接单 + 自动二次
 * 确认」 design. Everything runs in the browser: a pinned BGE embedding
 * model (vendored, self-hosted) proposes a ticket per order, the
 * student's need_confirm(similarity, margin) — run in the shared Pyodide
 * worker — decides when the simulated customer restates, and the fixed
 * parser reads the restatement. Nothing is saved or judged; the page's
 * job is to measure model accuracy and timing on real hardware.
 */

import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { Disclosure } from "../../../shared/ui/Disclosure";
import { Icon } from "../../../shared/ui/Icon";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import {
  AI_MODEL_ID,
  normalizedResults,
  PRACTICE_ORDERS,
  predictTicket,
  resolveOrder,
  textsToEmbed,
  type AiOrderOutcome,
  type Vector,
} from "../domain/aiIntake.ts";
import { sameTicket, type Ticket } from "../domain/contracts.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { CodeEditor } from "../ui/CodeEditor.tsx";
import { embedTexts, loadEmbedder, type EmbedInfo, type EmbedProgress } from "../ui/embedRunner.ts";
import { runNeedConfirm, warmPyodide } from "../ui/pyodideRunner.ts";
import "./aiPoc.css";

const NEED_CONFIRM_STARTER = `def need_confirm(similarity, margin):
    if similarity < 0.85:
        return True
    if margin < 0.10:
        return True
    return False
`;

function ticketText(ticket: Ticket): string {
  return `${ticket.item || "?"} · 「${ticket.note}」 · ${ticket.table || "?"}号桌 · ${ticket.urgent ? "加急" : "普通"}`;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function fmt(score: number): string {
  return score.toFixed(3);
}

function OrderRow(props: { outcome: AiOrderOutcome }) {
  const prediction = () => props.outcome.prediction;
  const fields = createMemo(
    () =>
      [
        ["菜品", prediction().item],
        ["备注", prediction().note],
        ["桌号", prediction().table],
        ["时效", prediction().urgent],
      ] as const,
  );
  return (
    <Disclosure
      class="ai-order"
      summary={
        <>
          <b>{props.outcome.id}</b> · {props.outcome.request}
          <span class={props.outcome.correct ? "ai-mark ok" : "ai-mark bad"}>
            <Icon name={props.outcome.correct ? "check" : "x"} size={12} />{" "}
            {props.outcome.correct ? "记对" : "记错"}
          </span>
        </>
      }
    >
      <div class="ai-order-body">
        <p>
          AI 猜：{ticketText(prediction().ticket)}（相似度 {fmt(prediction().similarity)}，差距{" "}
          {fmt(prediction().margin)}）
        </p>
        <Show
          fallback={<p class="ai-confirm-line">未触发二次确认，直接采用 AI 结果。</p>}
          when={props.outcome.confirmed}
        >
          <p class="ai-confirm-line">
            触发二次确认（+{props.outcome.extraTicks} 拍）→ 顾客复述：{props.outcome.clarifyText}
          </p>
        </Show>
        <p>
          最终小票：<b>{ticketText(props.outcome.ticket)}</b>
        </p>
        <table class="ai-field-table">
          <thead>
            <tr>
              <th>字段</th>
              <th>AI 选</th>
              <th>来源</th>
              <th>相似度</th>
              <th>与第二名差距</th>
              <th>候选得分</th>
            </tr>
          </thead>
          <tbody>
            <For each={fields()}>
              {([label, field]) => (
                <tr>
                  <td>{label}</td>
                  <td>
                    {String(
                      field.value === true ? "加急" : field.value === false ? "普通" : field.value,
                    )}
                  </td>
                  <td>{field.source === "literal" ? "字面规则" : "向量"}</td>
                  <td>{fmt(field.similarity)}</td>
                  <td>{fmt(field.margin)}</td>
                  <td>
                    <ul class="ai-score-list">
                      <For each={field.scores}>
                        {(entry) => (
                          <li>
                            {entry.value === "true"
                              ? "加急"
                              : entry.value === "false"
                                ? "普通"
                                : entry.value}
                            （{entry.prototype}）{fmt(entry.score)}
                          </li>
                        )}
                      </For>
                    </ul>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Disclosure>
  );
}

export function AiIntakePocPage() {
  const [modelStatus, setModelStatus] = createSignal<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [modelInfo, setModelInfo] = createSignal<EmbedInfo | null>(null);
  const [progress, setProgress] = createSignal<EmbedProgress | null>(null);
  const [modelError, setModelError] = createSignal<string | null>(null);
  const [code, setCode] = createSignal(NEED_CONFIRM_STARTER);
  const [running, setRunning] = createSignal(false);
  const [runError, setRunError] = createSignal<string | null>(null);
  const [outcomes, setOutcomes] = createSignal<AiOrderOutcome[] | null>(null);
  const [timing, setTiming] = createSignal<{ embedMs: number; totalMs: number } | null>(null);

  onSettled(() => {
    warmPyodide();
    // Debug handle for offline scoring experiments (dev route only).
    (window as unknown as { __aiEmbed: typeof embedTexts }).__aiEmbed = embedTexts;
  });

  const load = async () => {
    setModelStatus("loading");
    setModelError(null);
    setProgress(null);
    try {
      const info = await loadEmbedder(setProgress);
      setModelInfo(info);
      setModelStatus("ready");
    } catch (error) {
      setModelError(error instanceof Error ? error.message : String(error));
      setModelStatus("error");
    }
  };

  const run = async () => {
    setRunning(true);
    setRunError(null);
    setOutcomes(null);
    try {
      const currentCode = code();
      const punct = describeFullWidthPunctuation(currentCode);
      if (punct) throw new Error(punct);
      const started = performance.now();
      const texts = textsToEmbed(PRACTICE_ORDERS.map((order) => order.request));
      const { vectors, ms: embedMs } = await embedTexts(texts);
      const embedOf = (text: string): Vector => vectors[texts.indexOf(text)];
      const predictions = PRACTICE_ORDERS.map((order) => predictTicket(order.request, embedOf));
      const cases: [number, number][] = predictions.map((prediction) => [
        round4(prediction.similarity),
        round4(prediction.margin),
      ]);
      const raw = await runNeedConfirm(currentCode, cases);
      const confirms = Array.isArray(raw) ? raw : [];
      if (
        confirms.length !== PRACTICE_ORDERS.length ||
        confirms.some((value) => typeof value !== "boolean")
      ) {
        throw new Error("need_confirm 要对每张订单返回 True 或 False。");
      }
      setOutcomes(
        PRACTICE_ORDERS.map((order, index) =>
          resolveOrder(order, predictions[index], confirms[index]),
        ),
      );
      setTiming({ embedMs, totalMs: Math.round(performance.now() - started) });
    } catch (error) {
      setRunError(friendlyRunError(error instanceof Error ? error.message : String(error)));
    } finally {
      setRunning(false);
    }
  };

  const expectedOf = (id: string) => PRACTICE_ORDERS.find((order) => order.id === id)?.expected;
  const predictedCorrect = createMemo(
    () =>
      outcomes()?.filter((outcome) => {
        const expected = expectedOf(outcome.id);
        return expected != null && sameTicket(outcome.prediction.ticket, expected);
      }).length ?? 0,
  );
  const finalCorrect = createMemo(
    () => outcomes()?.filter((outcome) => outcome.correct).length ?? 0,
  );
  const confirmCount = createMemo(
    () => outcomes()?.filter((outcome) => outcome.confirmed).length ?? 0,
  );

  return (
    <AppPageLayout
      class="ai-poc"
      topbarProps={{
        title: "智能接单 PoC",
        subtitle: "浏览器本地模型 · 不上服务器 · 不计成绩",
      }}
    >
      <main class="ai-poc-workspace">
        <section class="ai-card">
          <h2>1 · 加载模型</h2>
          <p>
            <code>{AI_MODEL_ID}</code>（量化版约 24 MB，文件在本机 vendor 目录）。优先 WebGPU
            用核显算，失败自动回退 WASM。
          </p>
          <div class="submit-row">
            <Button
              class="button button-secondary"
              disabled={modelStatus() === "loading" || modelStatus() === "ready"}
              onClick={() => void load()}
              type="button"
            >
              {modelStatus() === "loading"
                ? "加载中…"
                : modelStatus() === "ready"
                  ? "已就绪"
                  : "加载模型"}
            </Button>
            <Show when={modelInfo()}>
              {(info) => (
                <span class="submit-note">
                  {info().device === "webgpu" ? "WebGPU（核显）" : "WASM（CPU）"} · {info().dtype} ·
                  加载 {info().loadMs} ms
                </span>
              )}
            </Show>
          </div>
          <Show when={progress()}>
            {(prog) => (
              <p class="submit-note">
                下载 {prog().file}：{Math.round(prog().loaded / 1024 / 1024)} /{" "}
                {Math.round(prog().total / 1024 / 1024)} MB
              </p>
            )}
          </Show>
          <Show when={modelError()}>
            {(err) => (
              <p class="test-error" role="alert">
                {err()}
                <br />
                模型文件在本机 vendor 目录里，先运行 <code>bun run sync:embed</code> 再重试。
              </p>
            )}
          </Show>
        </section>

        <section class="ai-card">
          <h2>2 · 写 need_confirm，跑 12 张订单</h2>
          <p>
            AI 给每张订单记一张小票，并报告 <code>similarity</code>（最有把握字段的分）和{" "}
            <code>margin</code>
            （第一名领先第二名多少）。你的函数决定要不要让顾客再确认一遍，确认必得正确小票，但多花 1
            拍。
          </p>
          <CodeEditor
            ariaLabel="need_confirm 代码"
            disabled={running()}
            onChange={setCode}
            value={code()}
          />
          <div class="submit-row">
            <Button
              class="button button-primary"
              disabled={modelStatus() !== "ready" || running()}
              onClick={() => void run()}
              type="button"
            >
              {running() ? "推理中…" : "运行，看 12 张小票"}
            </Button>
            <Show when={timing()}>
              {(t) => (
                <span class="submit-note">
                  向量计算 {t().embedMs} ms · 全流程 {t().totalMs} ms
                </span>
              )}
            </Show>
          </div>
          <Show when={runError()}>
            {(err) => (
              <p class="test-error" role="alert">
                {err()}
              </p>
            )}
          </Show>
        </section>

        <Show when={outcomes()}>
          {(list) => (
            <section class="ai-card">
              <h2>3 · 结果</h2>
              <p class="ai-summary">
                AI 直接记对 <b>{predictedCorrect()}</b> / {PRACTICE_ORDERS.length} · 二次确认{" "}
                <b>{confirmCount()}</b> 次（额外 {confirmCount()} 拍）· 最终记对{" "}
                <b>{finalCorrect()}</b> / {PRACTICE_ORDERS.length}
              </p>
              <div class="ai-order-list">
                <For each={list()}>{(outcome) => <OrderRow outcome={outcome} />}</For>
              </div>
              <h3>标准化提交（服务器会收到的样子）</h3>
              <pre class="ai-json">
                {JSON.stringify(normalizedResults("intake-poc-v1", list()), null, 2)}
              </pre>
            </section>
          )}
        </Show>
      </main>
    </AppPageLayout>
  );
}
