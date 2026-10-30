/**
 * Stage 4 · 正式挑战: the student's word tables and priority table carry
 * over from stages 2/3. The server replays everything on the hidden order
 * set and returns only counts. Like stages 2/3 the panel never locks —
 * below the pass line the student retries, and after passing they can
 * still resubmit to chase a better score.
 */

import { useState } from "react";
import { checkPriorityTable } from "../domain/priority.ts";
import { FINAL_PASS_SCORE } from "../domain/stages.ts";
import type { FinalDraft, FinalOrderResult, LunchTestSummary } from "../domain/protocol.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { checkIntakeTables } from "../domain/wordTables.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { INTAKE_STARTER } from "./IntakePanel.tsx";
import { runIntakeTables, runPriorityTable } from "./pyodideRunner.ts";
import { QUEUE_STARTER } from "./QueuePanel.tsx";

export function FinalPanel({
  draft,
  submitting,
  result,
  onChange,
  onSubmit,
}: {
  draft: FinalDraft;
  submitting: boolean;
  result: LunchTestSummary | null;
  onChange: (draft: FinalDraft) => void;
  onSubmit: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tableErrors, setTableErrors] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const intakeSource = draft.intakeCode.trim() ? draft.intakeCode : INTAKE_STARTER;
  const queueSource = draft.queueCode.trim() ? draft.queueCode : QUEUE_STARTER;
  const ready = draft.tables !== null && draft.priority !== null;

  const finalResult = result?.kind === "final" ? result : null;

  const run = async () => {
    setRunning(true);
    setError(null);
    setTableErrors([]);
    try {
      const punct =
        describeFullWidthPunctuation(intakeSource) ?? describeFullWidthPunctuation(queueSource);
      if (punct) throw new Error(punct);
      const rawTables = await runIntakeTables(intakeSource);
      const parts = Array.isArray(rawTables) ? rawTables : [];
      const tables = checkIntakeTables({
        dish: parts[0],
        note: parts[1],
        calm: parts[2],
        rush: parts[3],
      });
      const rawPriority = await runPriorityTable(queueSource);
      const priority = checkPriorityTable(rawPriority);
      const errors = [...tables.errors, ...priority.errors];
      if (errors.length > 0 || priority.table === null) {
        setTableErrors(errors);
        return;
      }
      onChange({
        intakeCode: intakeSource,
        tables: tables.tables,
        queueCode: queueSource,
        priority: priority.table,
      });
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="lunch-challenge">
      <p>
        正式订单的说法和练习不同。词表沿用第二关，这里只编辑排队函数，合计至少 {FINAL_PASS_SCORE}{" "}
        分过关，没过可以改了再交。
      </p>

      <p className="eyebrow">排队的函数</p>
      <p className="lunch-note">
        priority 的参数同第三关：urgent 是否加急、wait 已等 0～30 拍、cook 做完这张单要几拍，只会是
        1 或 3。
      </p>
      <CodeEditor
        ariaLabel="priority 函数代码"
        disabled={running}
        onChange={(queueCode) => onChange({ ...draft, queueCode, priority: null })}
        value={queueSource}
      />

      <div className="submit-row">
        <button
          className="button button-secondary"
          disabled={running}
          onClick={() => void run()}
          type="button"
        >
          {running ? "运行中…" : "运行，更新词表和结果表"}
        </button>
        <button
          className="button button-primary"
          disabled={submitting || !ready}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? "判定中…" : "提交正式挑战"}
        </button>
        {ready ? null : <span className="submit-note">还没有算出的词表和结果表。</span>}
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

      {finalResult ? (
        <section className="lunch-result" role="status">
          <p className="eyebrow">正式成绩</p>
          <div className="lunch-stat-row">
            <span>
              <b>
                {finalResult.correct} / {finalResult.total}
              </b>
              小票正确
            </span>
            <span>
              <b>
                {finalResult.served} / {finalResult.total}
              </b>
              记对且准时
            </span>
            <span>
              <b>
                {finalResult.correct + finalResult.served} / {finalResult.total * 2}
              </b>
              合计
            </span>
          </div>
          <p
            className={
              finalResult.correct + finalResult.served >= FINAL_PASS_SCORE
                ? "lunch-feedback success"
                : "lunch-feedback"
            }
          >
            {finalResult.correct + finalResult.served >= FINAL_PASS_SCORE
              ? "合计压线，这版过关。"
              : `差 ${FINAL_PASS_SCORE - finalResult.correct - finalResult.served} 分到 ${FINAL_PASS_SCORE} 的过关线，改改词表或排队函数再交一次。`}
          </p>
          <div className="lunch-table-wrap">
            <table className="lunch-orders-table">
              <thead>
                <tr>
                  <th>订单</th>
                  <th>小票</th>
                  <th>送达</th>
                </tr>
              </thead>
              <tbody>
                {(finalResult.orders ?? []).map((order: FinalOrderResult) => (
                  <tr key={order.id}>
                    <td>
                      <b>{order.id}</b>
                    </td>
                    <td>{order.correct ? "记对了" : "记错了"}</td>
                    <td>{order.onTime ? "记对且准时" : "没算分"}</td>
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
