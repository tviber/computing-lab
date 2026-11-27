import { Button } from "@ui-sdk/solid/button";
import { createSignal, For, Show } from "solid-js";
import { Disclosure } from "../../../shared/ui/Disclosure";
import type { TicketPrediction } from "../domain/aiIntake.ts";
import { checkPriorityTable } from "../domain/priority.ts";
import type { AiDraft, AiOrderResult, LunchTestSummary } from "../domain/protocol.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { AI_CONFIRM_BUDGET, AI_PASS_CORRECT, AI_SERVED_MIN } from "../domain/stages.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { OrderPreviewTable, type PreviewRow } from "./OrderPreviewTable.tsx";
import { runPriorityTable } from "./pyodideRunner.ts";
import { QUEUE_STARTER, QueueResultView } from "./QueuePanel.tsx";
import {
  AiModelStatusBanner,
  NEED_CONFIRM_STARTER,
  useAiIntakeModel,
  type IntakeOrderInput,
} from "./useAiIntakeModel.tsx";

export type AiIntakeFinalProps = {
  draft: AiDraft;
  orders: IntakeOrderInput[];
  submitting: boolean;
  result: LunchTestSummary | null;
  onChange: (draft: AiDraft) => void;
  onSubmit: () => void;
};

/** Stage 4 (晚餐高峰) final shell: hidden orders + need_confirm + carried-over priority. */
export function AiIntakeFinalPanel(props: AiIntakeFinalProps) {
  const model = useAiIntakeModel();
  const [running, setRunning] = createSignal(false);
  const [runNote, setRunNote] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [preview, setPreview] = createSignal<PreviewRow[] | null>(null);

  const confirmSource = () =>
    props.draft.confirmCode.trim() ? props.draft.confirmCode : NEED_CONFIRM_STARTER;
  const queueSource = () => (props.draft.queueCode.trim() ? props.draft.queueCode : QUEUE_STARTER);
  const ready = () => props.draft.results !== null && props.draft.priority !== null;

  const finalResult = () => (props.result?.kind === "final" ? props.result : null);
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

  const makePreviewRows = (
    predictions: TicketPrediction[],
    confirms: readonly boolean[],
  ): PreviewRow[] =>
    props.orders.map((order, index) => ({
      id: order.id,
      request: order.request,
      prediction: predictions[index],
      confirmed: confirms[index] ?? false,
    }));

  const run = async () => {
    setRunning(true);
    setError(null);
    setRunNote(null);
    try {
      const confirmCode = confirmSource();
      const queueCode = queueSource();
      const punct =
        describeFullWidthPunctuation(confirmCode) ?? describeFullWidthPunctuation(queueCode);
      if (punct) throw new Error(punct);
      const { predictions, confirms, cached } = await model.evaluateConfirm(
        confirmCode,
        props.orders,
      );
      const rows = makePreviewRows(predictions, confirms);
      setPreview(rows);
      const results = rows.map((row) => ({
        id: row.id,
        ticket: row.prediction.ticket,
        confirmed: row.confirmed,
      }));
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
      });
      setRunNote(cached ? "预测结果已经缓存，这次只重新执行了 need_confirm。" : null);
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section class="lunch-challenge">
      <p>这一关把接单和排单放在一起跑。先重跑一遍，再提交看完整回放。</p>

      <AiModelStatusBanner model={model} />

      <p class="eyebrow">你写的确认规则</p>
      <CodeEditor
        ariaLabel="need_confirm 函数代码"
        disabled={running()}
        onChange={(confirmCode) => {
          props.onChange({ ...props.draft, confirmCode, results: null });
          setPreview(null);
          setRunNote(null);
        }}
        value={confirmSource()}
      />

      <p class="eyebrow">厨房排单函数（沿用第三关）</p>
      <CodeEditor
        ariaLabel="priority 函数代码"
        disabled={running()}
        onChange={(queueCode) => props.onChange({ ...props.draft, queueCode, priority: null })}
        value={queueSource()}
      />

      <div class="submit-row">
        <Button
          class="button button-secondary"
          disabled={running() || model.modelStatus() !== "ready" || props.orders.length === 0}
          onClick={() => void run()}
          type="button"
        >
          {running() ? "推理中…" : `重跑这 ${props.orders.length} 张单`}
        </Button>
        <Button
          class="button button-primary"
          disabled={props.submitting || !ready()}
          onClick={() => props.onSubmit()}
          type="button"
        >
          {props.submitting ? "判定中…" : "提交并看回放"}
        </Button>
        <Show when={!ready()}>
          <span class="submit-note">先重跑接单和排单，再提交看回放。</span>
        </Show>
        <span class="submit-note">
          过关线：12 张全对、确认 ≤4 次、记对且准时 ≥11 张。可以多次提交看回放。
        </span>
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
        {(rows) => <OrderPreviewTable open rows={rows()} showCorrect={false} />}
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

            <Disclosure class="lunch-reference" summary="逐单看送达结果">
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
            </Disclosure>
          </section>
        )}
      </Show>
    </section>
  );
}
