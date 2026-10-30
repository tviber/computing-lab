/**
 * Stage 5 · 附加挑战: the 晚高峰 set replayed first-come-first-served left
 * 11 orders late or undelivered — the only lever left is
 * compensate(urgent, overtime, delivered). Scoring is grounded in the
 * displayed bad-review table: expected bad reviews ≤ 4.5 AND spend ≤ 80
 * 元 to pass, so refunding every undelivered order (90 元) already breaks
 * the budget — the student must pick which ones deserve it.
 */

import { useState } from "react";
import {
  bestCompensation,
  checkCompensateTable,
  COMPENSATE_CHOICES,
  COMPENSATE_COST,
  COMPENSATE_PASS_REVIEWS,
  COMPENSATE_PASS_SPEND,
  compensateLateOrders,
  evaluateCompensation,
  REVIEW_RISK,
  REVIEW_RISK_TIERS,
} from "../domain/compensate.ts";
import type { CompensateDraft, LunchTestSummary } from "../domain/protocol.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { runCompensateTable } from "./pyodideRunner.ts";

export const COMPENSATE_STARTER = `def compensate(urgent, overtime, delivered):
    # 0 不补偿 / 1 送小食（2 元）/ 2 部分退款（15 元）
    if overtime >= 8:
        return 2
    if overtime >= 4:
        return 1
    return 0
`;

/** The same fixed run everyone pays for — mirrors the judge. */
const lateOrders = compensateLateOrders();
const best = bestCompensation(lateOrders);

const reviewsText = (points: number) => `${points / 100}`;

export function CompensatePanel({
  draft,
  submitting,
  result,
  submitted,
  onChange,
  onSubmit,
}: {
  draft: CompensateDraft;
  submitting: boolean;
  result: LunchTestSummary | null;
  submitted: boolean;
  onChange: (draft: CompensateDraft) => void;
  onSubmit: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tableErrors, setTableErrors] = useState<string[]>([]);
  const [local, setLocal] = useState<ReturnType<typeof evaluateCompensation> | null>(null);
  const [running, setRunning] = useState(false);

  const source = draft.code.trim() ? draft.code : COMPENSATE_STARTER;
  const ready = draft.compensate !== null;

  const judged = result?.kind === "compensate" ? result : null;
  const shown =
    local !== null
      ? {
          badReviewPoints: local.badReviewPoints,
          spend: local.spend,
          bestReviewPoints: best.badReviewPoints,
          bestSpend: best.spend,
          orders: local.orders,
        }
      : judged;

  const run = async () => {
    setRunning(true);
    setError(null);
    setTableErrors([]);
    try {
      const punct = describeFullWidthPunctuation(source);
      if (punct) throw new Error(punct);
      const raw = await runCompensateTable(source);
      const checked = checkCompensateTable(raw);
      if (checked.errors.length > 0 || checked.table === null) {
        setTableErrors(checked.errors);
        return;
      }
      setLocal(evaluateCompensation(lateOrders, checked.table));
      onChange({ code: source, compensate: checked.table });
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="lunch-challenge">
      <p>
        晚高峰 20 单还是按先来先做跑完的，有 {lateOrders.length}
        张出了问题：有的送晚了，有的没送到。排法不能改了，能改的只有补救：每张问题单补偿几档，由
        compensate 决定。
      </p>
      <div className="lunch-params">
        <ul>
          <li>
            <code>compensate(urgent, overtime, delivered)</code>：urgent 是不是加急单，overtime
            超过等待上限几拍，delivered 最后有没有送到（True 或 False）。
          </li>
          <li>返回 0 不补偿：不花钱，按店里的历史差评率认账。</li>
          <li>返回 1 送小食：一张 2 元；返回 2 部分退款：一张 15 元。</li>
          <li>没送到的单 overtime 按等到第 30 拍算（可能还是 0），看 delivered 最靠谱。</li>
          <li>
            过关线：预计差评 ≤ {reviewsText(COMPENSATE_PASS_REVIEWS)} 单，补偿总花费 ≤{" "}
            {COMPENSATE_PASS_SPEND} 元，两条都要压住。
          </li>
        </ul>
      </div>

      <details className="lunch-reference" open>
        <summary>店里的历史差评率</summary>
        <p className="lunch-note">同样的遭遇，加急顾客一直更没耐心。</p>
        <div className="lunch-table-wrap">
          <table className="lunch-orders-table">
            <thead>
              <tr>
                <th>这张单的遭遇</th>
                <th>不补偿</th>
                <th>送小食</th>
                <th>部分退款</th>
              </tr>
            </thead>
            <tbody>
              {REVIEW_RISK_TIERS.flatMap((tier) =>
                (["normal", "urgent"] as const).map((kind) => (
                  <tr key={`${tier.key}-${kind}`}>
                    <td>
                      {kind === "urgent" ? "加急" : "普通"} · {tier.label}
                    </td>
                    {REVIEW_RISK[tier.key][kind].map((rate, choice) => (
                      <td key={choice}>{rate}%</td>
                    ))}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>

      <details className="lunch-reference">
        <summary>看这 {lateOrders.length} 张问题单</summary>
        <p className="lunch-note">就是 compensate 会收到的参数，一张单一行。</p>
        <div className="lunch-table-wrap">
          <table className="lunch-orders-table">
            <thead>
              <tr>
                <th>订单</th>
                <th>urgent</th>
                <th>delivered</th>
                <th>overtime</th>
                <th>遭遇</th>
              </tr>
            </thead>
            <tbody>
              {lateOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <b>{order.id}</b>
                  </td>
                  <td>{order.urgent ? "True" : "False"}</td>
                  <td>{order.delivered ? "True" : "False"}</td>
                  <td>{order.overtime}</td>
                  <td>{order.delivered ? `送到了，超时 ${order.overtime} 拍` : "没送到"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <CodeEditor
        ariaLabel="compensate 函数代码"
        disabled={submitted || running}
        onChange={(code) => {
          setLocal(null);
          setTableErrors([]);
          onChange({ code, compensate: null });
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
          {running ? "运行中…" : "运行，算一遍账"}
        </button>
        <button
          className="button button-primary"
          disabled={submitting || !ready}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? "判定中…" : "提交附加挑战"}
        </button>
        {ready ? null : <span className="submit-note">还没有算出的结果表。</span>}
      </div>

      {error ? (
        <p className="test-error" role="alert">
          {error}
        </p>
      ) : null}
      {tableErrors.length > 0 ? (
        <ul className="lunch-order-fix" role="alert">
          {tableErrors.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : null}

      {shown ? (
        <section className="lunch-result" role="status">
          <p className="eyebrow">账单</p>
          <div className="lunch-stat-row">
            <span>
              <b>{reviewsText(shown.badReviewPoints)}</b>
              预计差评（单）
            </span>
            <span>
              <b>{shown.spend}</b>
              补偿花费（元）
            </span>
            <span>
              <b>
                {reviewsText(shown.bestReviewPoints)} / {shown.bestSpend} 元
              </b>
              最优（花费 ≤ {COMPENSATE_PASS_SPEND} 元）
            </span>
          </div>
          <p
            className={
              shown.badReviewPoints <= COMPENSATE_PASS_REVIEWS &&
              shown.spend <= COMPENSATE_PASS_SPEND
                ? "lunch-feedback success"
                : "lunch-feedback"
            }
          >
            {shown.badReviewPoints <= COMPENSATE_PASS_REVIEWS &&
            shown.spend <= COMPENSATE_PASS_SPEND
              ? "预计差评和花费都压线内，这版能过关。"
              : [
                  shown.badReviewPoints <= COMPENSATE_PASS_REVIEWS
                    ? ""
                    : `预计差评超过 ${reviewsText(COMPENSATE_PASS_REVIEWS)} 单的线`,
                  shown.spend <= COMPENSATE_PASS_SPEND
                    ? ""
                    : `补偿花费超过 ${COMPENSATE_PASS_SPEND} 元的线`,
                ]
                  .filter(Boolean)
                  .join("；") + "。"}
          </p>
          <div className="lunch-table-wrap">
            <table className="lunch-orders-table">
              <thead>
                <tr>
                  <th>订单</th>
                  <th>类型</th>
                  <th>遭遇</th>
                  <th>补偿</th>
                  <th>差评率</th>
                  <th>花费</th>
                </tr>
              </thead>
              <tbody>
                {(shown.orders ?? []).map((order) => (
                  <tr key={order.id}>
                    <td>
                      <b>{order.id}</b>
                    </td>
                    <td>{order.urgent ? "加急" : "普通"}</td>
                    <td>{order.delivered ? `送到了，超时 ${order.overtime} 拍` : "没送到"}</td>
                    <td>{COMPENSATE_CHOICES[order.choice] ?? order.choice}</td>
                    <td>{order.risk}%</td>
                    <td>{COMPENSATE_COST[order.choice] ?? 0} 元</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}
