/**
 * Stage 5 · 附加挑战: the 晚高峰 set replayed first-come-first-served left
 * 11 orders late or undelivered — the only lever left is
 * compensate(urgent, overtime, delivered, price). Scoring is grounded in
 * the displayed bad-review table: expected bad reviews ≤ 4.0 AND spend
 * ≤ 70 元 to pass. A refund costs the order's own price (half when it
 * arrived late, full when it never did), so the cheap-looking choice is
 * not always the cheap one.
 */

import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Disclosure } from "../../../shared/ui/Disclosure";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
import {
  bestCompensation,
  checkCompensateTable,
  COMPENSATE_CHOICES,
  COMPENSATE_PASS_REVIEWS,
  COMPENSATE_PASS_SPEND,
  COMPENSATE_SNACK_COST,
  COMPENSATE_TABLE_SIZE,
  compensateCost,
  compensateIndex,
  compensateLateOrders,
  evaluateCompensation,
  MENU_PRICES,
  REVIEW_RISK,
  REVIEW_RISK_TIERS,
  reviewRisk,
  type CompensateLateOrder,
} from "../domain/compensate.ts";
import type { CompensateDraft, LunchTestSummary } from "../domain/protocol.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { runCompensateTable } from "./pyodideRunner.ts";

export const COMPENSATE_STARTER = `def compensate(urgent, overtime, delivered, price):
    # 0 不补偿 / 1 送小食（2 元）/ 2 退款（送到的退一半，没送到的全退）
    if not delivered:
        return 2
    if overtime >= 4:
        return 1
    return 0
`;

/** The same fixed run everyone pays for — mirrors the judge. */
const lateOrders = compensateLateOrders();
const best = bestCompensation(lateOrders);

const RISK_ROWS = REVIEW_RISK_TIERS.flatMap((tier) =>
  (["normal", "urgent"] as const).map((kind) => ({
    key: `${tier.key}-${kind}`,
    label: `${kind === "urgent" ? "加急" : "普通"} · ${tier.label}`,
    rates: REVIEW_RISK[tier.key][kind],
  })),
);
const COMPENSATE_CHOICE_VALUES = [0, 1, 2] as const;

const reviewsText = (points: number) => `${points / 100}`;
const reviewDeltaText = (current: number, baseline: number) => {
  const diff = (current - baseline) / 100;
  if (Math.abs(diff) < 0.005) return "差评不变";
  return diff < 0 ? `少 ${Math.abs(diff).toFixed(2)} 单差评` : `多 ${diff.toFixed(2)} 单差评`;
};
const spendDeltaText = (current: number, baseline: number) => {
  const diff = current - baseline;
  if (diff === 0) return "花费不变";
  return diff > 0 ? `多花 ${diff.toFixed(0)} 元` : `少花 ${Math.abs(diff).toFixed(0)} 元`;
};

function sampleLateOrders(orders: readonly CompensateLateOrder[]): CompensateLateOrder[] {
  const picked: CompensateLateOrder[] = [];
  const add = (predicate: (order: CompensateLateOrder) => boolean) => {
    const found = orders.find((order) => !picked.includes(order) && predicate(order));
    if (found) picked.push(found);
  };
  add((order) => order.delivered && order.overtime === 7 && order.price === 12);
  add((order) => !order.delivered && order.price === 22 && !order.urgent);
  add((order) => order.urgent && order.delivered && order.overtime === 1);
  for (const order of orders) {
    if (picked.length >= 3) break;
    if (!picked.includes(order)) picked.push(order);
  }
  return picked.slice(0, 3);
}

function TryoutBoard(props: { orders: readonly CompensateLateOrder[] }) {
  const samples = createMemo(() => sampleLateOrders(props.orders));
  const [choices, setChoices] = createSignal<Record<string, number>>({});
  const choiceOf = (id: string) => choices()[id] ?? 0;
  const setChoice = (id: string, value: number) =>
    setChoices((current) => ({ ...current, [id]: value }));

  const table = createMemo(() => {
    const result = new Array<number>(COMPENSATE_TABLE_SIZE).fill(0);
    for (const order of samples()) {
      result[compensateIndex(order.urgent, order.overtime, order.delivered, order.price)] =
        choiceOf(order.id);
    }
    return result;
  });
  const bill = createMemo(() => evaluateCompensation(props.orders, table()));

  return (
    <section class="lunch-tryout">
      <p class="eyebrow">先手动试一次</p>
      <h2>这三张单，你会怎么补？</h2>
      <p>
        先改下面三张典型问题单，其他 8
        张暂时按不补偿算。每次切换都会重算整张账单，你可以直接看到花费和预计差评怎么变。
      </p>
      <div class="lunch-tryout-list">
        <For each={samples()}>
          {(order) => {
            const risk = () =>
              reviewRisk(order.urgent, order.overtime, order.delivered, choiceOf(order.id));
            const cost = () => compensateCost(order.delivered, order.price, choiceOf(order.id));
            const baseRisk = () => reviewRisk(order.urgent, order.overtime, order.delivered, 0);
            return (
              <article class="lunch-tryout-card">
                <div class="lunch-tryout-head">
                  <b>{order.id}</b>
                  <span>
                    {order.delivered ? `送到了，超时 ${order.overtime} 拍` : "没送到"} ·{" "}
                    {order.urgent ? "加急" : "普通"} · {order.price} 元
                  </span>
                </div>
                <SegmentedPicker
                  class="lunch-tryout-choices"
                  itemClass="lunch-tryout-choice"
                  label={`${order.id} 的补偿选择`}
                  onChange={(value) => setChoice(order.id, Number(value))}
                  options={COMPENSATE_CHOICE_VALUES.map((value) => ({
                    value: String(value),
                    label: COMPENSATE_CHOICES[value],
                  }))}
                  value={String(choiceOf(order.id))}
                />
                <p class="lunch-tryout-line">
                  差评率 {risk()}% · 这一单花 {cost()} 元
                </p>
                <Show when={choiceOf(order.id) > 0}>
                  <p class="lunch-tryout-delta">
                    比不补偿：{reviewDeltaText(risk(), baseRisk())}，{spendDeltaText(cost(), 0)}
                  </p>
                </Show>
              </article>
            );
          }}
        </For>
      </div>
      <div aria-label="试算账单" class="lunch-stat-row">
        <span>
          <b>{reviewsText(bill().badReviewPoints)}</b>
          试算后的整张账单预计差评（单）
        </span>
        <span>
          <b>{bill().spend}</b>
          试算后的整张账单补偿花费（元）
        </span>
      </div>
      <div class="submit-row">
        <Button class="button button-secondary" onClick={() => setChoices({})} type="button">
          把试算清空
        </Button>
        <span class="submit-note">试算不会计分，只帮你看清每一档补偿的代价。</span>
      </div>
    </section>
  );
}

export function CompensatePanel(props: {
  draft: CompensateDraft;
  submitting: boolean;
  result: LunchTestSummary | null;
  submitted: boolean;
  onChange: (draft: CompensateDraft) => void;
  onSubmit: () => void;
}) {
  const [error, setError] = createSignal<string | null>(null);
  const [tableErrors, setTableErrors] = createSignal<string[]>([]);
  const [local, setLocal] = createSignal<ReturnType<typeof evaluateCompensation> | null>(null);
  const [running, setRunning] = createSignal(false);

  const source = () => (props.draft.code.trim() ? props.draft.code : COMPENSATE_STARTER);
  const ready = () => props.draft.compensate !== null;

  const judged = () => (props.result?.kind === "compensate" ? props.result : null);
  const shown = createMemo(() => {
    const l = local();
    if (l !== null) {
      return {
        badReviewPoints: l.badReviewPoints,
        spend: l.spend,
        bestReviewPoints: best.badReviewPoints,
        bestSpend: best.spend,
        orders: l.orders,
      };
    }
    return judged();
  });

  const run = async () => {
    setRunning(true);
    setError(null);
    setTableErrors([]);
    try {
      const code = source();
      const punct = describeFullWidthPunctuation(code);
      if (punct) throw new Error(punct);
      const raw = await runCompensateTable(code);
      const checked = checkCompensateTable(raw);
      if (checked.errors.length > 0 || checked.table === null) {
        setTableErrors(checked.errors);
        return;
      }
      setLocal(evaluateCompensation(lateOrders, checked.table));
      props.onChange({ code, compensate: checked.table });
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section class="lunch-challenge">
      <p>
        晚高峰 20 单还是按先来先做跑完的，其中有 {lateOrders.length}
        张出了问题：有的送晚了，有的没送到。排法已经不能改了，能改的只有补救。每张问题单补偿几档，由你写的
        compensate 决定。
      </p>
      <div class="lunch-params">
        <ul>
          <li>
            <code>compensate(urgent, overtime, delivered, price)</code>：urgent 表示是不是加急单；
            overtime 表示超过等待上限几拍；delivered 表示最后有没有送到（True 或 False）；price
            是这单的金额（元）。
          </li>
          <li>返回 0 表示不补偿：不花钱，按店里的历史差评率认账。</li>
          <li>
            返回 1 表示送小食：一张 {COMPENSATE_SNACK_COST} 元。返回 2 表示退款：送到的退一半（price
            ÷ 2 向上取整），没送到的全退（price 元）。
          </li>
          <li>
            菜单价：
            {Object.entries(MENU_PRICES)
              .map(([dish, price]) => `${dish} ${price} 元`)
              .join("，")}
            。
          </li>
          <li>没送到的单，overtime 按等到第 30 拍算，可能还是 0，所以看 delivered 更可靠。</li>
          <li>
            过关线：预计差评不超过 {reviewsText(COMPENSATE_PASS_REVIEWS)} 单，补偿总花费不超过{" "}
            {COMPENSATE_PASS_SPEND} 元，两条都要满足。
          </li>
        </ul>
      </div>

      <Disclosure class="lunch-reference" defaultOpen summary="店里的历史差评率">
        <p class="lunch-note">同样的等待和补偿，加急顾客给出差评的概率更高。</p>
        <div class="lunch-table-wrap">
          <table class="lunch-orders-table">
            <thead>
              <tr>
                <th>这张单的遭遇</th>
                <th>不补偿</th>
                <th>送小食</th>
                <th>退款</th>
              </tr>
            </thead>
            <tbody>
              <For each={RISK_ROWS}>
                {(row) => (
                  <tr>
                    <td>{row.label}</td>
                    <For each={row.rates}>{(rate) => <td>{rate}%</td>}</For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Disclosure>

      <TryoutBoard orders={lateOrders} />

      <Disclosure class="lunch-reference" summary={`看这 ${lateOrders.length} 张问题单`}>
        <p class="lunch-note">这是 compensate 会收到的参数，一张单一行。</p>
        <div class="lunch-table-wrap">
          <table class="lunch-orders-table">
            <thead>
              <tr>
                <th>订单</th>
                <th>urgent</th>
                <th>delivered</th>
                <th>overtime</th>
                <th>price</th>
                <th>遭遇</th>
              </tr>
            </thead>
            <tbody>
              <For each={lateOrders}>
                {(order) => (
                  <tr>
                    <td>
                      <b>{order.id}</b>
                    </td>
                    <td>{order.urgent ? "True" : "False"}</td>
                    <td>{order.delivered ? "True" : "False"}</td>
                    <td>{order.overtime}</td>
                    <td>{order.price}</td>
                    <td>{order.delivered ? `送到了，超时 ${order.overtime} 拍` : "没送到"}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Disclosure>

      <CodeEditor
        ariaLabel="compensate 函数代码"
        disabled={props.submitted || running()}
        onChange={(code) => {
          setLocal(null);
          setTableErrors([]);
          props.onChange({ code, compensate: null });
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
          {running() ? "运行中…" : "用这版补偿规则算一遍"}
        </Button>
        <Button
          class="button button-primary"
          disabled={props.submitting || !ready()}
          onClick={() => props.onSubmit()}
          type="button"
        >
          {props.submitting ? "判定中…" : "提交附加挑战"}
        </Button>
        <Show when={!ready()}>
          <span class="submit-note">还没有运行 compensate，请先算一遍。</span>
        </Show>
      </div>

      <Show when={error()}>
        {(err) => (
          <p class="test-error" role="alert">
            {err()}
          </p>
        )}
      </Show>
      <Show when={tableErrors().length > 0}>
        <ul class="lunch-order-fix" role="alert">
          <For each={tableErrors()}>{(text) => <li>{text}</li>}</For>
        </ul>
      </Show>

      <Show when={shown()}>
        {(s) => (
          <section class="lunch-result" role="status">
            <p class="eyebrow">账单</p>
            <div class="lunch-stat-row">
              <span>
                <b>{reviewsText(s().badReviewPoints)}</b>
                预计差评（单）
              </span>
              <span>
                <b>{s().spend}</b>
                补偿花费（元）
              </span>
              <Show when={props.submitted}>
                <span>
                  <b>
                    {reviewsText(s().bestReviewPoints)} / {s().bestSpend} 元
                  </b>
                  过关后的最优参考
                </span>
              </Show>
            </div>
            <p
              class={
                s().badReviewPoints <= COMPENSATE_PASS_REVIEWS && s().spend <= COMPENSATE_PASS_SPEND
                  ? "lunch-feedback success"
                  : "lunch-feedback"
              }
            >
              {s().badReviewPoints <= COMPENSATE_PASS_REVIEWS && s().spend <= COMPENSATE_PASS_SPEND
                ? "预计差评和花费都在线内，这一版能过关。"
                : [
                    s().badReviewPoints <= COMPENSATE_PASS_REVIEWS
                      ? ""
                      : `预计差评 ${reviewsText(s().badReviewPoints)} 单，超过了 ${reviewsText(COMPENSATE_PASS_REVIEWS)} 单的上限`,
                    s().spend <= COMPENSATE_PASS_SPEND
                      ? ""
                      : `补偿花费 ${s().spend} 元，超过了 ${COMPENSATE_PASS_SPEND} 元的预算`,
                  ]
                    .filter(Boolean)
                    .join("；") + "。"}
            </p>
            <div class="lunch-table-wrap">
              <table class="lunch-orders-table">
                <thead>
                  <tr>
                    <th>订单</th>
                    <th>类型</th>
                    <th>遭遇</th>
                    <th>金额</th>
                    <th>补偿</th>
                    <th>差评率</th>
                    <th>花费</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={s().orders ?? []}>
                    {(order) => (
                      <tr>
                        <td>
                          <b>{order.id}</b>
                        </td>
                        <td>{order.urgent ? "加急" : "普通"}</td>
                        <td>{order.delivered ? `送到了，超时 ${order.overtime} 拍` : "没送到"}</td>
                        <td>{order.price} 元</td>
                        <td>{COMPENSATE_CHOICES[order.choice] ?? order.choice}</td>
                        <td>{order.risk}%</td>
                        <td>{order.cost} 元</td>
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
