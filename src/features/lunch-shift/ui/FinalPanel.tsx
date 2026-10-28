/**
 * Stage 4 · 正式挑战: the student's word tables and priority table carry
 * over from stages 2/3. One last edit + rerun is allowed, then a one-shot
 * submission — the server replays everything on the hidden order set and
 * returns only counts.
 */

import { useState } from "react";
import { checkPriorityTable } from "../domain/priority.ts";
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
  submitted,
  onChange,
  onSubmit,
}: {
  draft: FinalDraft;
  submitting: boolean;
  result: LunchTestSummary | null;
  submitted: boolean;
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
      <p>词表和函数是你前两关的成果。可以最后再改，改完先运行一遍再交——只能交一次。</p>

      <p className="eyebrow">接单的词表</p>
      <CodeEditor
        ariaLabel="词表代码"
        disabled={submitted}
        onChange={(intakeCode) => onChange({ ...draft, intakeCode, tables: null })}
        value={intakeSource}
      />
      <p className="eyebrow">排队的函数</p>
      <CodeEditor
        ariaLabel="priority 函数代码"
        disabled={submitted}
        onChange={(queueCode) => onChange({ ...draft, queueCode, priority: null })}
        value={queueSource}
      />

      {submitted ? null : (
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
          {ready ? null : <span className="submit-note">先运行一遍，算出词表和结果表。</span>}
        </div>
      )}

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
