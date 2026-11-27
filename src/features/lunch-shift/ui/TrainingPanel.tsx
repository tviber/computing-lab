/**
 * Stage 1 · 订单旅程: the guided three-station walkthrough of one order —
 * record the ticket, choose the cook order, deliver to the right table.
 * Completed steps stay visible read-only (images, the question and the
 * chosen answer) so students can look back after finishing.
 */

import { Button } from "@ui-sdk/solid/button";
import { createSignal, For, Show } from "solid-js";
import { DISHES, NOTES, TABLES } from "../domain/contracts.ts";
import type { TrainingDraft } from "../domain/protocol.ts";
import type { TrainingOrder } from "../domain/scenarios.ts";
import { TickExplainer } from "./TickExplainer.tsx";

const STEP_ORDER = ["record", "cook", "deliver", "done"] as const;

function ticketSummary(ticket: TrainingDraft["ticket"]): string {
  if (!ticket) return "—";
  return `${ticket.table} 号桌 · ${ticket.item} · 备注「${ticket.note}」 · ${ticket.urgent ? "加急" : "普通"}`;
}

function ticketDifferences(
  ticket: NonNullable<TrainingDraft["ticket"]>,
  expected: TrainingOrder["ticket"],
): string[] {
  const differences: string[] = [];
  if (ticket.item !== expected.item) differences.push(`菜品应为${expected.item}`);
  if (ticket.note !== expected.note) differences.push(`备注应为${expected.note}`);
  if (ticket.table !== expected.table) differences.push(`桌号应为 ${expected.table}，写错会送错桌`);
  if (ticket.urgent !== expected.urgent)
    differences.push(expected.urgent ? "顾客说了赶时间，应选加急" : "顾客说不赶时间，应选普通");
  return differences;
}

export function TrainingPanel(props: {
  draft: TrainingDraft;
  training: TrainingOrder;
  passed: boolean;
  submitting: boolean;
  onChange: (draft: TrainingDraft) => void;
  onSubmit: () => void;
}) {
  const [error, setError] = createSignal<string | null>(null);
  const [form, setForm] = createSignal({ item: "", note: "", table: "", urgent: "" });
  const stepIndex = () => STEP_ORDER.indexOf(props.draft.step);
  const recordDone = () => stepIndex() >= 1;
  const cookDone = () => stepIndex() >= 2;

  const submitTicket = (event: SubmitEvent) => {
    event.preventDefault();
    const currentForm = form();
    const ticket = {
      item: currentForm.item,
      note: currentForm.note,
      table: currentForm.table,
      urgent: currentForm.urgent === "true",
    };
    const differences = ticketDifferences(ticket, props.training.ticket);
    if (differences.length > 0) {
      setError(differences.join("；") + "。请修改小票。");
      props.onChange({ ...props.draft, ticket });
      return;
    }
    setError(null);
    props.onChange({ ...props.draft, step: "cook", ticket });
  };

  const completedWell = () => props.draft.kitchenChoice === "urgent";
  const cookingResult = () =>
    props.draft.kitchenChoice === "urgent"
      ? "你先做加急单：它在第 1 拍就做好了，比排在后面少等 3 拍；普通单第 4 拍才做好。"
      : props.draft.kitchenChoice === "normal"
        ? "你先做普通单：它在第 3 拍做好，加急单到第 4 拍才做好，比先做它多等 3 拍。"
        : "两份餐已做好。厨房里的先后顺序会影响等待时间。";

  const readonlyTicketFields = () =>
    [
      ["菜品", props.draft.ticket?.item ?? ""],
      ["备注", props.draft.ticket?.note ?? ""],
      ["桌号", props.draft.ticket?.table ? `${props.draft.ticket.table} 号桌` : ""],
      ["是否加急", props.draft.ticket ? (props.draft.ticket.urgent ? "加急" : "普通") : ""],
    ] as const;

  return (
    <section class="lunch-journey">
      {/* 1 / 3 记小票 —— 写对后保留成只读卡 */}
      <p class="eyebrow">订单旅程 · 1 / 3</p>
      <h2>把顾客的话记成小票</h2>
      <p>
        你是前台接单员。厨房不直接听顾客说话，只认你记的小票；小票上任何地方记错，餐都可能做错或送错。店里有个付费选项：顾客多付几块钱可以把单子加成「加急」，后厨优先做。你记的「加急/普通」写的就是这个。
      </p>
      <img
        alt="前台接单员把小票夹到板上，柜台前顾客在说话"
        class="lunch-journey-img"
        src="/assets/lunch-shift/journey-ticket.webp"
      />
      <blockquote class="lunch-ticket-quote">“{props.training.request}”</blockquote>
      <Show
        fallback={
          <>
            <Show when={error()}>
              {(err) => (
                <p class="lunch-feedback mistake" role="alert">
                  {err()}
                </p>
              )}
            </Show>
            <Show when={error() && form().item}>
              <p class="lunch-note">
                按这张票：厨房会做 <b>{form().item}</b>，并送往 <b>{form().table || "—"} 号桌</b>。
              </p>
            </Show>
            <form onSubmit={submitTicket}>
              <div class="lunch-form-grid">
                <label class="field-select">
                  菜品
                  <select
                    onChange={(e) => setForm((f) => ({ ...f, item: e.currentTarget.value }))}
                    required
                    value={form().item}
                  >
                    <option value="">请选择</option>
                    <For each={DISHES}>{(dish) => <option value={dish}>{dish}</option>}</For>
                  </select>
                </label>
                <label class="field-select">
                  备注
                  <select
                    onChange={(e) => setForm((f) => ({ ...f, note: e.currentTarget.value }))}
                    required
                    value={form().note}
                  >
                    <option value="">请选择</option>
                    <For each={NOTES}>{(note) => <option value={note}>{note}</option>}</For>
                  </select>
                </label>
                <label class="field-select">
                  桌号
                  <select
                    onChange={(e) => setForm((f) => ({ ...f, table: e.currentTarget.value }))}
                    required
                    value={form().table}
                  >
                    <option value="">请选择</option>
                    <For each={TABLES}>
                      {(table) => <option value={table}>{table} 号桌</option>}
                    </For>
                  </select>
                </label>
                <label class="field-select">
                  是否加急
                  <select
                    onChange={(e) => setForm((f) => ({ ...f, urgent: e.currentTarget.value }))}
                    required
                    value={form().urgent}
                  >
                    <option value="">请选择</option>
                    <option value="false">普通</option>
                    <option value="true">加急</option>
                  </select>
                </label>
              </div>
              <div class="submit-row">
                <Button class="button button-primary" type="submit">
                  把小票交给厨房 →
                </Button>
              </div>
            </form>
          </>
        }
        when={recordDone()}
      >
        <div class="lunch-feedback success" role="status">
          <strong>✓ 小票交到厨房了</strong>
          <span>{ticketSummary(props.draft.ticket)}</span>
        </div>
        <div aria-label="你记的小票" class="lunch-form-grid">
          <For each={readonlyTicketFields()}>
            {([label, value]) => (
              <label class="field-select">
                {label}
                <select disabled value={value}>
                  <option value={value}>{value || "—"}</option>
                </select>
              </label>
            )}
          </For>
        </div>
      </Show>

      {/* 2 / 3 先做哪张 —— 选完后保留成只读卡 */}
      <Show when={stepIndex() >= 1}>
        <p class="eyebrow">订单旅程 · 2 / 3</p>
        <img
          alt="灶台前悬着两张小票卡，厨师选择先做哪一张"
          class="lunch-journey-img"
          src="/assets/lunch-shift/journey-cook.webp"
        />
        <h2>两张订单，先做哪一张？</h2>
        <p>加急的订单超过 9 拍就算超时，普通订单超过 18 拍就算超时。</p>
        <p>现在假设你是厨师，以下两个订单，你会先做哪一个：</p>
        <details class="lunch-reference">
          <summary>「拍」是什么</summary>
          <TickExplainer />
        </details>
        <Show
          fallback={
            <form
              class="lunch-choice-list"
              onSubmit={(event) => {
                event.preventDefault();
                const choice = new FormData(event.currentTarget).get("choice");
                if (choice === "urgent" || choice === "normal") {
                  props.onChange({ ...props.draft, step: "deliver", kitchenChoice: choice });
                }
              }}
            >
              <label class="choice-surface lunch-choice-card">
                <input name="choice" required type="radio" value="urgent" />
                <span>
                  <b>2 号桌 · 鸡腿饭</b>
                  <small>加急 · 制作需要 1 拍</small>
                </span>
              </label>
              <label class="choice-surface lunch-choice-card">
                <input name="choice" required type="radio" value="normal" />
                <span>
                  <b>
                    {props.draft.ticket
                      ? `${props.draft.ticket.table} 号桌 · ${props.draft.ticket.item}`
                      : "5 号桌 · 牛肉面"}
                  </b>
                  <small>{props.draft.ticket?.urgent ? "加急" : "普通"} · 制作需要 3 拍</small>
                </span>
              </label>
              <Button class="button button-primary" type="submit">
                确认制作顺序 →
              </Button>
            </form>
          }
          when={cookDone()}
        >
          <div aria-label="你的选择" class="lunch-choice-list">
            <label class="choice-surface lunch-choice-card">
              <input
                checked={props.draft.kitchenChoice === "urgent"}
                disabled
                readonly
                type="radio"
              />
              <span>
                <b>2 号桌 · 鸡腿饭</b>
                <small>加急 · 制作需要 1 拍</small>
              </span>
            </label>
            <label class="choice-surface lunch-choice-card">
              <input
                checked={props.draft.kitchenChoice === "normal"}
                disabled
                readonly
                type="radio"
              />
              <span>
                <b>
                  {props.draft.ticket
                    ? `${props.draft.ticket.table} 号桌 · ${props.draft.ticket.item}`
                    : "5 号桌 · 牛肉面"}
                </b>
                <small>{props.draft.ticket?.urgent ? "加急" : "普通"} · 制作需要 3 拍</small>
              </span>
            </label>
          </div>
          <div class={`lunch-feedback ${completedWell() ? "success" : "neutral"}`} role="status">
            <strong>
              {completedWell() ? "✓ 先做加急单，少等 3 拍" : "先做了普通单，加急顾客多等 3 拍"}
            </strong>
            <span>
              {completedWell()
                ? "加急单在第 1 拍完成，普通单在第 4 拍完成。"
                : "两份餐都能做出来，但加急的顾客等得更久。"}
            </span>
          </div>
        </Show>
      </Show>

      {/* 3 / 3 送餐 —— 送对后保留成只读卡 */}
      <Show when={stepIndex() >= 2}>
        <p class="eyebrow">订单旅程 · 3 / 3</p>
        <img
          alt="送餐员端着餐盘走向贴有数字5的餐桌"
          class="lunch-journey-img"
          src="/assets/lunch-shift/journey-deliver.webp"
        />
        <h2>这份餐送到哪一桌？</h2>
        <p>
          你是送餐员，按小票送餐，送错桌这份餐就白做了。小票：
          <b>{ticketSummary(props.draft.ticket)}</b>
        </p>
        <Show
          fallback={
            <>
              <Show when={error()}>
                {(err) => (
                  <p class="lunch-feedback mistake" role="alert">
                    {err()}
                  </p>
                )}
              </Show>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const table = new FormData(event.currentTarget).get("table");
                  if (typeof table !== "string") return;
                  if (table !== props.draft.ticket?.table) {
                    setError(
                      `小票写的是 ${props.draft.ticket?.table ?? "—"} 号桌，送去 ${table} 号桌会送错。请再核对一次。`,
                    );
                    return;
                  }
                  setError(null);
                  props.onChange({ ...props.draft, step: "done", deliveredTable: table });
                }}
              >
                <label class="field-select">
                  送到
                  <select name="table" required>
                    <option disabled selected value="">
                      请选择
                    </option>
                    <For each={TABLES}>
                      {(table) => <option value={table}>{table} 号桌</option>}
                    </For>
                  </select>
                </label>
                <div class="submit-row">
                  <Button class="button button-primary" type="submit">
                    送餐 →
                  </Button>
                </div>
              </form>
            </>
          }
          when={stepIndex() >= 3}
        >
          <label class="field-select">
            送到
            <select disabled value={props.draft.deliveredTable ?? ""}>
              <option value={props.draft.deliveredTable ?? ""}>
                {props.draft.deliveredTable ? `${props.draft.deliveredTable} 号桌` : "—"}
              </option>
            </select>
          </label>
        </Show>
      </Show>

      <Show when={props.draft.step === "done"}>
        <div
          class={`lunch-feedback ${completedWell() ? "success victory" : "neutral"}`}
          role="status"
        >
          <strong>{completedWell() ? "✓ 订单送对了！" : "流程完成，但加急单等得更久"}</strong>
          <span>{ticketSummary(props.draft.ticket)}</span>
        </div>
        <h2>一张订单送到了顾客手里</h2>
        <div aria-label="刚才经过的系统流程" class="lunch-system-chain">
          <span>顾客提出需求</span>
          <i>→</i>
          <span>你录入订单数据</span>
          <i>→</i>
          <span>厨房按数据制作</span>
          <i>→</i>
          <span>送到对应顾客</span>
        </div>
        <p class="lunch-note">{cookingResult()}</p>
        <Show
          fallback={
            <div class="submit-row">
              <Button
                class="button button-primary"
                disabled={props.submitting}
                onClick={() => props.onSubmit()}
                type="button"
              >
                {props.submitting ? "提交中…" : "完成订单旅程 →"}
              </Button>
            </div>
          }
          when={props.passed}
        >
          <p class="stage-takeaway">
            已通过：订单就是数据，一旦系统中某个环节出错，后面的流程全部跟着错。
          </p>
        </Show>
      </Show>
    </section>
  );
}
