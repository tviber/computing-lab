/**
 * Stage 2 · 修接单: the word-table editor. The student edits the four
 * variables, runs the code in the Pyodide worker, and the derived tables
 * are what get saved and judged — the server replays the same fixed parser.
 */

import { useState } from "react";
import { INTAKE_SCENARIO } from "../domain/scenarios.ts";
import type { IntakeDraft, IntakeOrderResult, LunchTestSummary } from "../domain/protocol.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { checkIntakeTables, evaluateIntake } from "../domain/wordTables.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { runIntakeTables } from "./pyodideRunner.ts";

export const INTAKE_STARTER = `# 程序只认下面这些词。查词顺序：先查 calm_words，再查 rush_words
dish_words = {"鸡腿饭": "鸡腿饭", "蛋炒饭": "蛋炒饭", "牛肉面": "牛肉面"}
note_words = {"不要香菜": "不要香菜", "少辣": "少辣", "加蛋": "加蛋"}
calm_words = ["不赶时间", "不急着"]
rush_words = ["赶时间", "急着", "快一点", "尽快"]
`;

function ticketText(ticket: {
  item: string;
  note: string;
  table: string;
  urgent: boolean;
}): string {
  return `${ticket.item || "没认出菜品"} · 「${ticket.note}」 · ${ticket.table || "没认出桌号"} 号桌 · ${ticket.urgent ? "加急" : "普通"}`;
}

/** Which table and word decided each field — or that nothing hit. */
function fieldReasons(order: IntakeOrderResult): string[] {
  const reasons: string[] = [];
  if (order.produced.item !== order.expected.item) {
    reasons.push(
      order.itemKey
        ? `菜品认成了「${order.produced.item}」（dish_words 里「${order.itemKey}」先命中）`
        : "菜品空着——dish_words 里没有词命中",
    );
  }
  if (order.produced.note !== order.expected.note) {
    reasons.push(
      order.noteKey
        ? `备注写成了「${order.produced.note}」（note_words 里「${order.noteKey}」先命中）`
        : `备注写成了「无备注」——note_words 里没有词命中，应为「${order.expected.note}」`,
    );
  }
  if (order.produced.urgent !== order.expected.urgent) {
    const via =
      order.urgentVia === "calm"
        ? `calm_words 里「${order.urgentKey}」命中 → 普通`
        : order.urgentVia === "rush"
          ? `rush_words 里「${order.urgentKey}」命中 → 加急`
          : "两张表都没命中 → 普通";
    reasons.push(`应为${order.expected.urgent ? "加急" : "普通"}单——${via}`);
  }
  return reasons;
}

export function IntakeResultList({ orders }: { orders: IntakeOrderResult[] }) {
  const wrong = orders.filter((order) => !order.correct);
  return (
    <div className="lunch-intake-results" role="status">
      <p className="eyebrow">
        小票正确 {orders.length - wrong.length} / {orders.length}
      </p>
      {wrong.length === 0 ? (
        <>
          <p className="lunch-feedback success">12 张原话全部记对了。</p>
          {orders.map((order) => (
            <details className="lunch-order-item" key={order.id}>
              <summary>
                <b>{order.id}</b> · {order.request}
              </summary>
              <ul>
                <li>小票：{ticketText(order.produced)}</li>
              </ul>
            </details>
          ))}
        </>
      ) : (
        wrong.map((order) => (
          <article className="lunch-order-fix" key={order.id}>
            <p>
              <b>{order.id}</b> · 顾客说：{order.request}
            </p>
            <ul>
              <li>你的小票：{ticketText(order.produced)}</li>
              <li>应该是：{ticketText(order.expected)}</li>
              {fieldReasons(order).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </article>
        ))
      )}
    </div>
  );
}

export function IntakePanel({
  draft,
  submitting,
  result,
  onChange,
  onSubmit,
}: {
  draft: IntakeDraft;
  submitting: boolean;
  /** Latest recorded judge summary — also drives the shown results. */
  result: LunchTestSummary | null;
  onChange: (draft: IntakeDraft) => void;
  onSubmit: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tableErrors, setTableErrors] = useState<string[]>([]);
  const [localResults, setLocalResults] = useState<IntakeOrderResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const source = draft.code.trim() ? draft.code : INTAKE_STARTER;
  const judgedOrders = result?.kind === "intake" ? (result.orders ?? null) : null;
  const judgedErrors = result?.kind === "intake" ? (result.errors ?? []) : [];
  // The newest local preview wins; the recorded grade shows only until a
  // fresh run replaces it.
  const shownOrders = localResults ?? judgedOrders;

  const run = async () => {
    setRunning(true);
    setError(null);
    setTableErrors([]);
    try {
      const punct = describeFullWidthPunctuation(source);
      if (punct) throw new Error(punct);
      const raw = await runIntakeTables(source);
      const parts = Array.isArray(raw) ? raw : [];
      const { tables, errors } = checkIntakeTables({
        dish: parts[0],
        note: parts[1],
        calm: parts[2],
        rush: parts[3],
      });
      if (errors.length > 0) {
        setTableErrors(errors);
        return;
      }
      onChange({ code: source, tables });
      setLocalResults(
        evaluateIntake(
          INTAKE_SCENARIO.orders.map((order) => ({
            id: order.id,
            request: order.request,
            expected: order.expected!,
          })),
          tables,
        ),
      );
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="lunch-challenge">
      <p>12 句顾客原话都由这四张词表决定怎么记成小票。</p>
      <div className="lunch-params">
        <ul>
          <li>
            <code>dish_words</code>：词 → 菜名。按写的顺序查，原话里第一个出现的词算数。
          </li>
          <li>
            <code>note_words</code>：词 → 备注。同样按顺序查，一个都没中记「无备注」。
          </li>
          <li>
            <code>calm_words</code>：普通信号词，最先查——原话命中它就是普通单。
          </li>
          <li>
            <code>rush_words</code>：加急信号词，calm 没中才查它——命中就是加急单。
          </li>
          <li>每张表最多 20 项；一个词去空格后 1～10 个字；菜名和备注的值要在菜单里。</li>
        </ul>
      </div>
      <CodeEditor
        ariaLabel="词表代码"
        disabled={running}
        onChange={(code) => {
          setLocalResults(null);
          setTableErrors([]);
          onChange({ code, tables: null });
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
          {running ? "运行中…" : "运行，检查 12 张小票"}
        </button>
        <button
          className="button button-primary"
          disabled={submitting || draft.tables === null}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? "判定中…" : "交服务器判分"}
        </button>
        {draft.tables === null ? <span className="submit-note">还没有算出的词表。</span> : null}
      </div>
      {error ? (
        <p className="test-error" role="alert">
          {error}
        </p>
      ) : null}
      {tableErrors.length > 0 || judgedErrors.length > 0 ? (
        <ul className="lunch-order-fix" role="alert">
          {[...judgedErrors, ...tableErrors].map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : null}
      {shownOrders ? <IntakeResultList orders={shownOrders} /> : null}
    </section>
  );
}
