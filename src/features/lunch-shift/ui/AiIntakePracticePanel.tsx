import { Button } from "@ui-sdk/solid/button";
import { createSignal, For, Show } from "solid-js";
import { Disclosure } from "../../../shared/ui/Disclosure";
import { Icon } from "../../../shared/ui/Icon";
import type { TicketPrediction } from "../domain/aiIntake.ts";
import { sameTicket } from "../domain/contracts.ts";
import type { AiIntakeDraft, AiIntakeOrderResult, LunchTestSummary } from "../domain/protocol.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { INTAKE_SCENARIO } from "../domain/scenarios.ts";
import { AI_CONFIRM_BUDGET } from "../domain/stages.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { ConfidenceScatter } from "./ConfidenceScatter.tsx";
import { OrderPreviewTable, type PreviewRow } from "./OrderPreviewTable.tsx";
import { TriageIntro } from "./TriageIntro.tsx";
import {
  AiModelStatusBanner,
  NEED_CONFIRM_STARTER,
  useAiIntakeModel,
  type IntakeOrderInput,
} from "./useAiIntakeModel.tsx";

export type AiIntakePracticeProps = {
  draft: AiIntakeDraft;
  orders: IntakeOrderInput[];
  submitting: boolean;
  result: LunchTestSummary | null;
  onChange: (draft: AiIntakeDraft) => void;
  onSubmit: () => void;
};

/** Stage 2 (智能接单) practice shell: triage warm-up, raw AI scatter, and need_confirm editor. */
export function AiIntakePracticePanel(props: AiIntakePracticeProps) {
  const model = useAiIntakeModel();
  const [running, setRunning] = createSignal(false);
  const [runNote, setRunNote] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [preview, setPreview] = createSignal<PreviewRow[] | null>(null);
  const [previewMode, setPreviewMode] = createSignal<"raw" | "run" | null>(null);
  const [previewStale, setPreviewStale] = createSignal(false);

  const confirmSource = () =>
    props.draft.confirmCode.trim() ? props.draft.confirmCode : NEED_CONFIRM_STARTER;
  const ready = () => props.draft.results !== null;
  const intakeResult = () => (props.result?.kind === "ai-intake" ? props.result : null);
  const intakeCaught = () => intakeResult()?.orders?.filter((order) => order.rescued) ?? [];
  const intakeWasted = () =>
    intakeResult()?.orders?.filter((order) => order.confirmed && !order.rescued) ?? [];

  const makePreviewRows = (
    predictions: TicketPrediction[],
    confirms?: readonly boolean[],
  ): PreviewRow[] =>
    props.orders.map((order, index) => {
      const prediction = predictions[index];
      const expected = INTAKE_SCENARIO.orders.find((entry) => entry.id === order.id)?.expected;
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
      const { predictions } = await model.predict(props.orders);
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
      const punct = describeFullWidthPunctuation(confirmCode);
      if (punct) throw new Error(punct);
      const { predictions, confirms, cached } = await model.evaluateConfirm(
        confirmCode,
        props.orders,
      );
      const rows = makePreviewRows(predictions, confirms);
      setPreview(rows);
      setPreviewMode("run");
      setPreviewStale(false);
      const results = rows.map((row) => ({
        id: row.id,
        ticket: row.prediction.ticket,
        confirmed: row.confirmed,
      }));
      props.onChange({ ...props.draft, confirmCode, results });
      setRunNote(cached ? "预测结果已经缓存，这次只重新执行了 need_confirm。" : null);
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section class="lunch-challenge">
      <p>先做两张人工质检，再让 AI 裸跑一遍，最后写 need_confirm 自动化判断。</p>

      <AiModelStatusBanner model={model} />

      <TriageIntro orders={props.orders} />

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
            disabled={running() || model.modelStatus() !== "ready" || props.orders.length === 0}
            onClick={() => void previewRaw()}
            type="button"
          >
            {preview() ? "重看 AI 裸跑" : `让 AI 先读这 ${props.orders.length} 张单`}
          </Button>
        </div>
        <Show
          fallback={
            <p class="lunch-note">
              {model.modelStatus() === "ready"
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

      <p class="eyebrow">你写的确认规则</p>
      <CodeEditor
        ariaLabel="need_confirm 函数代码"
        disabled={running()}
        onChange={(confirmCode) => {
          props.onChange({ ...props.draft, confirmCode, results: null });
          setPreviewStale(preview()?.some((row) => row.confirmed) ?? false);
          setRunNote(null);
        }}
        value={confirmSource()}
      />

      <div class="submit-row">
        <Button
          class="button button-secondary"
          disabled={running() || model.modelStatus() !== "ready" || props.orders.length === 0}
          onClick={() => void run()}
          type="button"
        >
          {running()
            ? "推理中…"
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
          {props.submitting ? "判定中…" : "提交这版确认规则"}
        </Button>
        <Show when={!ready()}>
          <span class="submit-note">先运行这版 need_confirm，才能提交。</span>
        </Show>
        <span class="submit-note">过关线：12 张全对，确认不超过 4 次。</span>
      </div>

      <Show when={error()}>
        {(err) => (
          <p class="test-error" role="alert">
            {err()}
          </p>
        )}
      </Show>
      <Show when={runNote()}>{(note) => <p class="lunch-note">{note()}</p>}</Show>

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
            <Disclosure
              class="lunch-reference"
              open={res().correct !== res().total || res().confirmed > AI_CONFIRM_BUDGET}
              summary="逐单看结果"
            >
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
                            <Icon name={order.correct ? "check" : "x"} size={12} />{" "}
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
            </Disclosure>
          </section>
        )}
      </Show>
    </section>
  );
}
