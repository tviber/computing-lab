/**
 * Stage 1 · 订单旅程: the guided three-station walkthrough of one order —
 * record the ticket, choose the cook order, deliver to the right table.
 * Client-side validation mirrors the original server's feedback text; the
 * judge re-checks the final record.
 */

import { useState, type FormEvent } from "react";
import { DISHES, NOTES, TABLES } from "../domain/contracts.ts";
import type { TrainingDraft } from "../domain/protocol.ts";
import { TRAINING_REQUEST, TRAINING_TICKET } from "../domain/scenarios.ts";

function ticketSummary(ticket: TrainingDraft["ticket"]): string {
  if (!ticket) return "—";
  return `${ticket.table} 号桌 · ${ticket.item} · 备注「${ticket.note}」 · ${ticket.urgent ? "加急" : "普通"}`;
}

function ticketDifferences(ticket: NonNullable<TrainingDraft["ticket"]>): string[] {
  const differences: string[] = [];
  if (ticket.item !== TRAINING_TICKET.item) differences.push(`菜品应为${TRAINING_TICKET.item}`);
  if (ticket.note !== TRAINING_TICKET.note) differences.push(`备注应为${TRAINING_TICKET.note}`);
  if (ticket.table !== TRAINING_TICKET.table)
    differences.push(`桌号应为 ${TRAINING_TICKET.table}，写错会送错桌`);
  if (ticket.urgent !== TRAINING_TICKET.urgent) differences.push("顾客说不赶时间，应选普通");
  return differences;
}

export function TrainingPanel({
  draft,
  passed,
  submitting,
  onChange,
  onSubmit,
}: {
  draft: TrainingDraft;
  passed: boolean;
  submitting: boolean;
  onChange: (draft: TrainingDraft) => void;
  onSubmit: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ item: "", note: "", table: "", urgent: "" });

  const submitTicket = (event: FormEvent) => {
    event.preventDefault();
    const ticket = {
      item: form.item,
      note: form.note,
      table: form.table,
      urgent: form.urgent === "true",
    };
    const differences = ticketDifferences(ticket);
    if (differences.length > 0) {
      setError(differences.join("；") + "。请修改小票。");
      onChange({ ...draft, ticket });
      return;
    }
    setError(null);
    onChange({ ...draft, step: "cook", ticket });
  };

  const completedWell = draft.kitchenChoice === "urgent";
  const cookingResult =
    draft.kitchenChoice === "urgent"
      ? "你先做加急单：它第 1 拍做好，比排在后面少等 3 拍；普通单第 4 拍做好。"
      : draft.kitchenChoice === "normal"
        ? "你先做普通单：它第 3 拍做好，加急单第 4 拍做好，比先做它多等 3 拍。"
        : "两份餐已做好。厨房里的先后顺序会影响等待时间。";

  return (
    <section className="lunch-journey">
      {draft.step === "record" ? (
        <>
          <p className="eyebrow">订单旅程 · 1 / 3</p>
          <h2>把顾客的话记成小票</h2>
          <p>
            你现在是前台接单员。厨房不直接听顾客说话，只认你记的小票；菜名或桌号写错一个，餐就可能做错、送错。
          </p>
          <blockquote className="lunch-ticket-quote">“{TRAINING_REQUEST}”</blockquote>
          {error ? (
            <p className="lunch-feedback mistake" role="alert">
              {error}
            </p>
          ) : null}
          {error && form.item ? (
            <p className="lunch-note">
              按这张票：厨房会做 <b>{form.item}</b>，并送往 <b>{form.table || "—"} 号桌</b>。
            </p>
          ) : null}
          <form onSubmit={submitTicket}>
            <div className="lunch-form-grid">
              <label className="field-select">
                菜品
                <select
                  onChange={(e) => setForm({ ...form, item: e.target.value })}
                  required
                  value={form.item}
                >
                  <option value="">请选择</option>
                  {DISHES.map((dish) => (
                    <option key={dish} value={dish}>
                      {dish}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-select">
                备注
                <select
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  required
                  value={form.note}
                >
                  <option value="">请选择</option>
                  {NOTES.map((note) => (
                    <option key={note} value={note}>
                      {note}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-select">
                桌号
                <select
                  onChange={(e) => setForm({ ...form, table: e.target.value })}
                  required
                  value={form.table}
                >
                  <option value="">请选择</option>
                  {TABLES.map((table) => (
                    <option key={table} value={table}>
                      {table} 号桌
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-select">
                是否加急
                <select
                  onChange={(e) => setForm({ ...form, urgent: e.target.value })}
                  required
                  value={form.urgent}
                >
                  <option value="">请选择</option>
                  <option value="false">普通</option>
                  <option value="true">加急</option>
                </select>
              </label>
            </div>
            <div className="submit-row">
              <button className="button button-primary" type="submit">
                把小票交给厨房 →
              </button>
            </div>
          </form>
        </>
      ) : null}

      {draft.step === "cook" ? (
        <>
          <p className="eyebrow">订单旅程 · 2 / 3</p>
          <div className="lunch-feedback success" role="status">
            <strong>✓ 小票交到厨房了</strong>
            <span>{ticketSummary(draft.ticket)}</span>
          </div>
          <h2>两张订单，先做哪一张？</h2>
          <p>
            现在换你掌勺。灶只有一口，一次只能做一份。你刚记的那张单和一张加急单同时在等，先做哪份由你定。（1
            拍是系统里的一个时间步）
          </p>
          <form
            className="lunch-choice-list"
            onSubmit={(event) => {
              event.preventDefault();
              const choice = new FormData(event.currentTarget).get("choice");
              if (choice === "urgent" || choice === "normal") {
                onChange({ ...draft, step: "deliver", kitchenChoice: choice });
              }
            }}
          >
            <label className="lunch-choice-card">
              <input name="choice" required type="radio" value="urgent" />
              <span>
                <b>2 号桌 · 鸡腿饭</b>
                <small>加急 · 制作 1 拍</small>
              </span>
            </label>
            <label className="lunch-choice-card">
              <input name="choice" required type="radio" value="normal" />
              <span>
                <b>
                  {draft.ticket
                    ? `${draft.ticket.table} 号桌 · ${draft.ticket.item}`
                    : "5 号桌 · 牛肉面"}
                </b>
                <small>普通 · 制作 3 拍</small>
              </span>
            </label>
            <button className="button button-primary" type="submit">
              确认制作顺序 →
            </button>
          </form>
        </>
      ) : null}

      {draft.step === "deliver" ? (
        <>
          <p className="eyebrow">订单旅程 · 3 / 3</p>
          <div className={`lunch-feedback ${completedWell ? "success" : "neutral"}`} role="status">
            <strong>
              {completedWell ? "✓ 先做加急单，少等 3 拍" : "先做了普通单，加急顾客多等 3 拍"}
            </strong>
            <span>
              {completedWell
                ? "加急单第 1 拍完成，普通单第 4 拍完成。"
                : "两份餐都能做出来，但加急的顾客等得更久。"}
            </span>
          </div>
          <h2>这份餐送到哪一桌？</h2>
          <p>
            最后你是送餐员。按小票送餐，送错桌这份餐就白做了。看小票：
            <b>{ticketSummary(draft.ticket)}</b>
          </p>
          {error ? (
            <p className="lunch-feedback mistake" role="alert">
              {error}
            </p>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const table = new FormData(event.currentTarget).get("table");
              if (typeof table !== "string") return;
              if (table !== draft.ticket?.table) {
                setError(
                  `小票写的是 ${draft.ticket?.table ?? "—"} 号桌，送去 ${table} 号桌会送错。请再核对一次。`,
                );
                return;
              }
              setError(null);
              onChange({ ...draft, step: "done", deliveredTable: table });
            }}
          >
            <label className="field-select">
              送到
              <select name="table" required defaultValue="">
                <option disabled value="">
                  请选择
                </option>
                {TABLES.map((table) => (
                  <option key={table} value={table}>
                    {table} 号桌
                  </option>
                ))}
              </select>
            </label>
            <div className="submit-row">
              <button className="button button-primary" type="submit">
                送餐 →
              </button>
            </div>
          </form>
        </>
      ) : null}

      {draft.step === "done" ? (
        <>
          <div
            className={`lunch-feedback ${completedWell ? "success victory" : "neutral"}`}
            role="status"
          >
            <strong>{completedWell ? "✓ 订单送对了！" : "流程完成，但加急单等得更久"}</strong>
            <span>{ticketSummary(draft.ticket)}</span>
          </div>
          <h2>一张订单送到了顾客手里</h2>
          <div className="lunch-system-chain" aria-label="刚才经过的系统流程">
            <span>顾客提出需求</span>
            <i>→</i>
            <span>你录入订单数据</span>
            <i>→</i>
            <span>厨房按数据制作</span>
            <i>→</i>
            <span>送到对应顾客</span>
          </div>
          <p className="lunch-note">{cookingResult}</p>
          {passed ? (
            <p className="stage-takeaway">已通过：订单 = 数据，字段错一个后面的流程全跟着错。</p>
          ) : (
            <div className="submit-row">
              <button
                className="button button-primary"
                disabled={submitting}
                onClick={onSubmit}
                type="button"
              >
                {submitting ? "提交中…" : "完成订单旅程 →"}
              </button>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
