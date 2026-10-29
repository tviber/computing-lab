/**
 * Stage 5 · 附加挑战: a fixed 20-order rush run left some orders late —
 * the only lever left is compensate(urgent, wait). 0 不补偿 / 1 小食
 * (cost 1, saves ≤3) / 2 部分退款 (cost 3, saves all). Net = 挽回 − 成本.
 */

import { useState } from "react";
import { checkCompensateTable, evaluateCompensation } from "../domain/compensate.ts";
import { priorityIndex, PRIORITY_TABLE_SIZE } from "../domain/priority.ts";
import type { CompensateDraft, LunchTestSummary } from "../domain/protocol.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { RUSH_SCENARIO } from "../domain/scenarios.ts";
import { simulate } from "../domain/simulator.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { runCompensateTable } from "./pyodideRunner.ts";

export const COMPENSATE_STARTER = `def compensate(urgent, wait):
    # 0 不补偿 / 1 送小食（成本 1，最多挽回 3 拍）/ 2 部分退款（成本 3，全挽回）
    if wait >= 19:
        return 1
    return 0
`;

/** The same fixed run everyone pays for — mirrors the judge. */
const fixedRun = (() => {
  const table = new Array(PRIORITY_TABLE_SIZE);
  for (const u of [false, true])
    for (let w = 0; w <= 30; w++) for (const c of [1, 3]) table[priorityIndex(u, w, c)] = u ? 1 : 0;
  return simulate(RUSH_SCENARIO, { priority: table }).result;
})();

const lateOrders = fixedRun.orders.filter((order) => !order.onTime);

const CHOICE_TEXT = ["不补偿", "送小食", "部分退款"];

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
  const shown = local ?? (result?.kind === "compensate" ? result : null);

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
      setLocal(evaluateCompensation(fixedRun.orders, checked.table));
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
        晚高峰 20 单按同一套加急优先的排法跑完，有 {lateOrders.length}
        张超时了。排法不能改了——能改的只有补救：每张超时单补偿几档，由 compensate 决定。
      </p>
      <div className="lunch-params">
        <ul>
          <li>
            <code>compensate(urgent, wait)</code>：urgent 这张单是否加急，wait 送达时已经等了几拍。
          </li>
          <li>返回 0 不补偿：成本 0，这张单的超时损失全吃。</li>
          <li>返回 1 送小食：成本 1，最多挽回 3 拍损失。</li>
          <li>返回 2 部分退款：成本 3，超时损失全挽回。</li>
          <li>
            超时损失 = 等超过上限的拍数（加急 9 拍、普通 18 拍）；净挽回 = 挽回 − 成本，可能是负数。
          </li>
        </ul>
      </div>

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
              <b>{shown.loss}</b>
              超时总损失（拍）
            </span>
            <span>
              <b>{shown.recovered}</b>
              挽回
            </span>
            <span>
              <b>{shown.cost}</b>
              补偿成本
            </span>
            <span>
              <b>{shown.net}</b>
              净挽回
            </span>
          </div>
          <div className="lunch-table-wrap">
            <table className="lunch-orders-table">
              <thead>
                <tr>
                  <th>订单</th>
                  <th>加急</th>
                  <th>送达等待</th>
                  <th>超时损失</th>
                  <th>补偿</th>
                  <th>挽回 − 成本</th>
                </tr>
              </thead>
              <tbody>
                {(shown.orders ?? []).map((order) => (
                  <tr key={order.id}>
                    <td>
                      <b>{order.id}</b>
                    </td>
                    <td>{order.urgent ? "加急" : "普通"}</td>
                    <td>{order.wait} 拍</td>
                    <td>{order.overtime} 拍</td>
                    <td>{CHOICE_TEXT[order.choice] ?? order.choice}</td>
                    <td>
                      {order.recovered} − {order.cost} = {order.recovered - order.cost}
                    </td>
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
