/**
 * Stage 1 · 订单旅程: the guided three-station walkthrough of one order —
 * record the ticket, choose the cook order, deliver to the table on the
 * ticket. A wrong ticket is allowed into the kitchen: the consequence
 * strip shows how the error travels to the stove and the runner before
 * the student rewrites it.
 */

import { Button } from "@ui-sdk/solid/button";
import { createSignal, For, Show } from "solid-js";
import { DISHES, NOTES, TABLES } from "../domain/contracts.ts";
import type { TrainingDraft } from "../domain/protocol.ts";
import type { TrainingOrder } from "../domain/scenarios.ts";
import { TickExplainer } from "./TickExplainer.tsx";

const STEP_ORDER = ["record", "cook", "deliver", "done"] as const;
const TICKS = [1, 2, 3, 4] as const;
const TICKET_FIELDS = [
  { label: "菜品", value: (ticket: TrainingDraft["ticket"]) => ticket?.item ?? "" },
  { label: "备注", value: (ticket: TrainingDraft["ticket"]) => ticket?.note ?? "" },
  {
    label: "桌号",
    value: (ticket: TrainingDraft["ticket"]) => (ticket?.table ? `${ticket.table} 号桌` : ""),
  },
  {
    label: "是否加急",
    value: (ticket: TrainingDraft["ticket"]) => (ticket ? (ticket.urgent ? "加急" : "普通") : ""),
  },
] as const;

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
  if (ticket.table !== expected.table) differences.push(`桌号应为 ${expected.table}`);
  if (ticket.urgent !== expected.urgent)
    differences.push(expected.urgent ? "顾客说了赶时间，应选加急" : "顾客说不赶时间，应选普通");
  return differences;
}

type RaceOrder = {
  label: string;
  cookTicks: number;
  start: number;
  done: number;
};

function CookRace(props: { urgentFirst: boolean; normalLabel: string }) {
  const sequence = (): { urgent: RaceOrder; normal: RaceOrder } =>
    props.urgentFirst
      ? {
          urgent: { label: "2 号桌 · 鸡腿饭", cookTicks: 1, start: 1, done: 1 },
          normal: { label: props.normalLabel, cookTicks: 3, start: 2, done: 4 },
        }
      : {
          normal: { label: props.normalLabel, cookTicks: 3, start: 1, done: 3 },
          urgent: { label: "2 号桌 · 鸡腿饭", cookTicks: 1, start: 4, done: 4 },
        };

  const cell = (order: RaceOrder, tick: number) => {
    if (tick === order.done) return "done";
    if (tick >= order.start && tick < order.done) return "cooking";
    return "waiting";
  };

  return (
    <div aria-label="两单在四拍里的制作进度" class="lunch-race">
      <div class="lunch-race-head">
        <span />
        <For each={TICKS}>{(tick) => <span>第 {tick} 拍</span>}</For>
      </div>
      <For each={[true, false] as const}>
        {(isUrgent) => {
          const order = () => (isUrgent ? sequence().urgent : sequence().normal);
          return (
            <div class="lunch-race-row">
              <span class="lunch-race-label">
                <b>{order().label}</b>
                <small>
                  {props.urgentFirst === isUrgent ? "先做" : "后做"} · 要做 {order().cookTicks} 拍
                </small>
              </span>
              <For each={TICKS}>
                {(tick) => (
                  <span class={`lunch-race-cell ${cell(order(), tick)}`}>
                    {cell(order(), tick) === "done"
                      ? "出餐"
                      : cell(order(), tick) === "cooking"
                        ? "做"
                        : ""}
                  </span>
                )}
              </For>
            </div>
          );
        }}
      </For>
    </div>
  );
}

export function TrainingPanel(props: {
  draft: TrainingDraft;
  training: TrainingOrder;
  passed: boolean;
  submitting: boolean;
  onChange: (draft: TrainingDraft) => void;
  onSubmit: () => void;
}) {
  const [form, setForm] = createSignal({ item: "", note: "", table: "", urgent: "" });
  const [compareOther, setCompareOther] = createSignal(false);
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
    props.onChange({ ...props.draft, step: "cook", ticket });
  };

  const reviseTicket = () => {
    const ticket = props.draft.ticket;
    setForm({
      item: ticket?.item ?? "",
      note: ticket?.note ?? "",
      table: ticket?.table ?? "",
      urgent: ticket ? String(ticket.urgent) : "",
    });
    setCompareOther(false);
    props.onChange({ ...props.draft, step: "record", ticket: null });
  };

  const redeliver = () => {
    props.onChange({ ...props.draft, step: "deliver", deliveredTable: null });
  };

  const differences = () =>
    props.draft.ticket ? ticketDifferences(props.draft.ticket, props.training.ticket) : [];
  const ticketOk = () => recordDone() && differences().length === 0;
  const deliveryOk = () => props.draft.deliveredTable === props.training.ticket.table;
  const orderDataOk = () => ticketOk() && deliveryOk();
  const completedWell = () => orderDataOk() && props.draft.kitchenChoice === "urgent";

  const consequenceSteps = () => {
    const ticket = props.draft.ticket;
    if (!ticket) return [];
    const expected = props.training.ticket;
    const steps: { who: string; text: string }[] = [];
    if (ticket.item !== expected.item || ticket.note !== expected.note) {
      steps.push({
        who: "厨房",
        text: `照着这张票做了${ticket.item}，备注「${ticket.note}」。顾客点的其实是${expected.item}，备注「${expected.note}」。菜端上桌时，顾客愣住了：“我没点这个。”`,
      });
    }
    if (!deliveryOk()) {
      steps.push({
        who: "送餐员",
        text: `把餐端到 ${props.draft.deliveredTable ?? "?"} 号桌。${expected.table} 号桌的顾客还在等自己的菜。`,
      });
    } else if (ticket.table !== expected.table) {
      steps.push({
        who: "送餐员",
        text: `这次你把餐送对了，但小票上写的是 ${ticket.table} 号桌。换一位送餐员照票送，就会送到错桌。`,
      });
    }
    if (ticket.urgent !== expected.urgent) {
      steps.push({
        who: "厨房",
        text: expected.urgent
          ? "这单本该优先做，却按普通单排在了后面。"
          : "这单没付加急费，却被当成加急单插到了前面。",
      });
    }
    return steps;
  };

  const cookingResult = () =>
    props.draft.kitchenChoice === "urgent"
      ? "你先做了加急单。它在第 1 拍出餐，普通单在第 4 拍出餐，比反过来做少了 3 拍等待。"
      : props.draft.kitchenChoice === "normal"
        ? "你先做了普通单。它在第 3 拍出餐，加急单等到第 4 拍才出餐，比先做加急单多等了 3 拍。"
        : "两份餐已经做好。厨房先做哪一张，会改变另一张的等待时间。";

  const normalChoiceLabel = () => {
    const ticket = props.draft.ticket;
    return ticket ? `${ticket.table} 号桌 · ${ticket.item}` : "5 号桌 · 牛肉面";
  };

  const normalChoiceUrgent = () => props.draft.ticket?.urgent ?? false;

  return (
    <section class="lunch-journey">
      <section class="lunch-story">
        <p class="eyebrow">午市高峰 · 小满餐馆</p>
        <h2>一个灶台，一位送餐员</h2>
        <p>午市一到，门口就排起队。厨房只有一个灶台，出餐口只有一位送餐员。</p>
        <p>
          为了多接单，店里卖「加急券」：顾客多付 3 元，厨房保证从下单起 9 拍内出餐；普通单的承诺是
          18 拍。
        </p>
        <p>你是前台接单员。厨房不直接听顾客说话，只认你写的小票；送餐员也按小票上的桌号送餐。</p>
      </section>

      {/* 1 / 3 记小票 */}
      <p class="eyebrow">订单旅程 · 1 / 3</p>
      <h2>把顾客的话记成小票</h2>
      <p>先听清这位顾客要什么，再把小票交给厨房。</p>
      <img
        alt="前台接单员把小票夹到板上，柜台前顾客在说话"
        class="lunch-journey-img"
        src="/assets/lunch-shift/journey-ticket.webp"
      />
      <blockquote class="lunch-ticket-quote">“{props.training.request}”</blockquote>
      <Show
        fallback={
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
                  <For each={TABLES}>{(table) => <option value={table}>{table} 号桌</option>}</For>
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
              <span class="submit-note">写错了也没关系，可以看看厨房会怎么处理。</span>
            </div>
          </form>
        }
        when={recordDone()}
      >
        <div aria-label="你记的小票" class="lunch-form-grid">
          <For each={TICKET_FIELDS}>
            {(field) => (
              <label class="field-select">
                {field.label}
                <select disabled value={field.value(props.draft.ticket)}>
                  <option value={field.value(props.draft.ticket)}>
                    {field.value(props.draft.ticket) || "—"}
                  </option>
                </select>
              </label>
            )}
          </For>
        </div>

        <Show when={differences().length > 0}>
          <p class="lunch-note">小票已经交到厨房。先继续走完这一单，看看会发生什么。</p>
        </Show>
      </Show>

      {/* 2 / 3 先做哪张 */}
      <Show when={stepIndex() >= 1}>
        <p class="eyebrow">订单旅程 · 2 / 3</p>
        <img
          alt="灶台前悬着两张小票卡，厨师选择先做哪一张"
          class="lunch-journey-img"
          src="/assets/lunch-shift/journey-cook.webp"
        />
        <h2>两张订单，先做哪一张？</h2>
        <p>加急的订单超过 9 拍就算超时，普通订单超过 18 拍就算超时。</p>
        <p>两份餐都还没下锅。你会先做哪一份？</p>
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
                  <b>{normalChoiceLabel()}</b>
                  <small>{normalChoiceUrgent() ? "加急" : "普通"} · 制作需要 3 拍</small>
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
                <b>{normalChoiceLabel()}</b>
                <small>{normalChoiceUrgent() ? "加急" : "普通"} · 制作需要 3 拍</small>
              </span>
            </label>
          </div>

          <div class="lunch-race-toolbar">
            <strong>{compareOther() ? "换成另一种顺序" : "你的制作顺序"}</strong>
            <Button
              class="button button-secondary"
              onClick={() => setCompareOther((value) => !value)}
              type="button"
            >
              {compareOther() ? "回到我的顺序" : "看看换成另一种顺序"}
            </Button>
          </div>
          <CookRace
            normalLabel={normalChoiceLabel()}
            urgentFirst={
              compareOther()
                ? props.draft.kitchenChoice === "normal"
                : props.draft.kitchenChoice === "urgent"
            }
          />
          <p class="lunch-note">
            两张单都在第 4 拍前出餐，所以都还没有超时。你选的是{" "}
            {props.draft.kitchenChoice === "urgent" ? "先做加急单" : "先做普通单"}。
          </p>
        </Show>
      </Show>

      {/* 3 / 3 送餐 */}
      <Show when={stepIndex() >= 2}>
        <p class="eyebrow">订单旅程 · 3 / 3</p>
        <img
          alt="送餐员端着餐盘走向贴有桌号的餐桌"
          class="lunch-journey-img"
          src="/assets/lunch-shift/journey-deliver.webp"
        />
        <h2>这份餐送到哪一桌？</h2>
        <p>
          你是送餐员。你只能看小票，不能回头问顾客。这张小票写的是：
          <b>{ticketSummary(props.draft.ticket)}</b>
        </p>
        <Show
          fallback={
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const table = new FormData(event.currentTarget).get("table");
                if (typeof table !== "string" || !table) return;
                props.onChange({ ...props.draft, step: "done", deliveredTable: table });
              }}
            >
              <label class="field-select">
                送到
                <select name="table" required>
                  <option disabled selected value="">
                    请选择
                  </option>
                  <For each={TABLES}>{(table) => <option value={table}>{table} 号桌</option>}</For>
                </select>
              </label>
              <div class="submit-row">
                <Button class="button button-primary" type="submit">
                  送餐 →
                </Button>
              </div>
            </form>
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
        <Show when={!orderDataOk()}>
          <div class="lunch-consequence" role="alert">
            <strong>送餐现场</strong>
            <p>厨房和送餐员都只按小票办事。你刚才这一单是这样跑完的：</p>
            <ol class="lunch-consequence-steps">
              <For each={consequenceSteps()}>
                {(step) => (
                  <li class="lunch-consequence-step">
                    <b>{step.who}</b>
                    <span>{step.text}</span>
                  </li>
                )}
              </For>
            </ol>
            <div class="submit-row">
              <Show
                fallback={
                  <Button class="button button-secondary" onClick={reviseTicket} type="button">
                    回前台改小票
                  </Button>
                }
                when={ticketOk()}
              >
                <Button class="button button-secondary" onClick={redeliver} type="button">
                  回到送餐这一步
                </Button>
              </Show>
              <span class="submit-note">把出错的环节改对，再重走这一单。</span>
            </div>
          </div>
        </Show>

        <div
          class={`lunch-feedback ${orderDataOk() ? "success victory" : "mistake"}`}
          role="status"
        >
          <strong>
            {!orderDataOk()
              ? "订单跑完了，但中途出了错"
              : completedWell()
                ? "✓ 订单送到了"
                : "订单送到了，不过加急顾客多等了 3 拍"}
          </strong>
          <span>{ticketSummary(props.draft.ticket)}</span>
        </div>

        <h2>一张订单走到了顾客手里</h2>
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
        <Show when={orderDataOk()}>
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
              已通过：厨房照着小票做菜，送餐员照着小票送桌。小票上的字段写错了，后面的人也只能照着错下去。
            </p>
          </Show>
        </Show>
      </Show>
    </section>
  );
}
