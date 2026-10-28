/**
 * Blockly rule editor — the kitchen UX ported to the lab. Rules attach
 * under the station's start block and run top-down; the saved draft is
 * the rules array plus workspace JSON for restoring the canvas.
 */

import { useState } from "react";
import { ruleLabel } from "../domain/blockStrategy.ts";
import {
  FOCUSES,
  FOCUS_LABELS,
  type BlockDrafts,
  type BlockRule,
  type Focus,
} from "../domain/contracts.ts";
import { BlocklyRuleEditor } from "./BlocklyRuleEditor.tsx";

const STATION_DESC: Record<Focus, string> = {
  intake: "把顾客原话整理成小票。",
  kitchen: "每口灶空出来时，系统只从待做订单里选一张。",
  delivery: "出餐员空闲后，只从已经做好的餐里选一份送出。",
};

/**
 * The rule logic, spelled out as the readable if/elif/else + while-loop
 * pseudocode a teacher can audit — the same shape the kitchen UI adopted.
 */
function LogicExplainer({ focus, rules }: { focus: Focus; rules: BlockRule[] }) {
  if (focus === "intake") {
    const notes = rules.filter((rule) => rule.type === "note");
    const synonyms = rules.filter((rule) => rule.type === "synonym");
    const holds = rules.some((rule) => rule.type === "hold_bad");
    const pick = (lines: string[]) =>
      lines.map((line, index) => `${index ? "elif" : "if"}${line}`).join("\n");
    const noteCode = `${pick([
      ...notes.map(
        (rule) =>
          ` 原话包含「${rule.phrase ?? ""}」:    小票.备注 =「${String(rule.value ?? "")}」   # 你的规则`,
      ),
      " 原话包含「不要香菜」:  小票.备注 =「不要香菜」   # 系统自带",
      " 原话包含「少辣」:      小票.备注 =「少辣」",
      " 原话包含「加蛋」:      小票.备注 =「加蛋」",
    ])}\nelse:                     小票.备注 =「无备注」`;
    const parseCode = [
      "原话 = 顾客说的话",
      synonyms.length
        ? `原话 = 套用同义词(原话)   # ${synonyms
            .map((rule) => `「${rule.phrase ?? ""}」按「${String(rule.value ?? "")}」理解`)
            .join("，")}`
        : "# 接入「同义词」规则后，这里会先统一说法",
      "",
      "# 第一步：系统把原话写成小票上的字段（逐条比较，命中即停）",
      noteCode,
      "",
      "# 菜品、桌号、加急也是同样的 if/elif 写法：",
      "#   菜品 = 鸡腿饭 / 蛋炒饭 / 牛肉面里最先命中的",
      "#   桌号 = 原话里的「N号桌」，接入规则后也认「桌 N」",
      "#   加急 = 原话有「赶时间/急着/快一点/尽快」，且没说「不赶时间/不急着」",
      holds
        ? "#   「拦住不完整小票」已接入：字段不全的小票被拦下，不进厨房。"
        : "#   字段没认全（比如没认出桌号）的小票照样进厨房 —— 错单就错在这一步。",
    ].join("\n");
    const chefCode = [
      "# 第二步：小票交给厨师，按备注操作",
      "if   小票.备注 ==「不要香菜」:  不放香菜",
      "elif 小票.备注 ==「少辣」:      少放辣椒",
      "elif 小票.备注 ==「加蛋」:      多加一颗蛋",
      "else:                          按标准配方做   # 「无备注」走这里",
    ].join("\n");
    return (
      <div className="lunch-logic">
        <p className="logic-subtitle">接单 · 原话变小票：第一步认字段，第二步照字段操作</p>
        <pre className="lunch-pseudocode">{parseCode}</pre>
        <pre className="lunch-pseudocode">{chefCode}</pre>
        <p className="lunch-note">
          系统原本认识「不要香菜、少辣、加蛋」，但不认识「不放香菜」——没加规则时会写成「无备注」，厨师就可能按标准配方放香菜。
        </p>
      </div>
    );
  }
  const activeRules = rules.filter((rule) => rule.type !== "aged_urgent");
  const agingRules = rules.filter((rule) => rule.type === "aged_urgent");
  const selectCode = [
    "def select(候选队列):        # 你的规则在这里生效，从上往下试",
    "    if 候选只有一张:           → 就是它",
    ...activeRules.map(
      (rule, index) => `    if 第${index + 1}条规则能分出先后: → 取它选中的   # ${ruleLabel(rule)}`,
    ),
    "    else:                     → 最早到的先取（FIFO）",
  ].join("\n");
  const loopCode = [
    "每一拍（系统时钟走 1 格），三站同时干自己的活：",
    "",
    "# 前台：每拍最多录入 1 单",
    "if 有新订单到达:",
    "    录入小票",
    "",
    "# 厨房：有几口空闲的灶，就同时开始几张",
    "while 灶台空闲 且 待做队列不空:",
    "    order = select(待做队列)",
    "    开始制作 order            # 灶一旦开工就不能换单",
    "",
    "# 出餐：一名送餐员，送出期间不能接下一单",
    "if 送餐员空闲 且 已做好队列不空:",
    "    order = select(已做好队列)",
    "    送出 order",
    "else:",
    "    送餐员待命",
  ].join("\n");
  return (
    <div className="lunch-logic">
      {agingRules.length > 0 ? (
        <p className="lunch-logic-normalize">
          <b>比较前先更新等待状态：</b>
          {agingRules.map((rule) => ruleLabel(rule)).join("；")}
          。还需要接入「加急订单优先」，这些订单才会因此排前面。
        </p>
      ) : null}
      <p className="logic-subtitle">三站每一拍的循环</p>
      <pre className="lunch-pseudocode">{loopCode}</pre>
      <p className="logic-subtitle">select：有多张候选单时怎么选</p>
      <pre className="lunch-pseudocode">{selectCode}</pre>
      <p className="lunch-note">
        {activeRules.length
          ? "前一条规则分不出先后，才比较下一条；全部打平时按先到先处理。"
          : "目前没有排序规则，所以有多张候选单时按先到先处理。"}
        「达到准时等待上限」只有接入对应规则后才参与排序；它不会自动取消订单，也不会打断正在制作或配送的订单。
      </p>
    </div>
  );
}

const START_LABEL: Record<Focus, string> = {
  intake: "收到顾客订单",
  kitchen: "选择下一张订单",
  delivery: "选择下一张订单",
};

export function RuleEditor({
  blocks,
  disabled,
  onChange,
}: {
  blocks: BlockDrafts;
  disabled?: boolean;
  onChange: (next: BlockDrafts) => void;
}) {
  const [activeFocus, setActiveFocus] = useState<Focus>("intake");
  const [message, setMessage] = useState<string | null>(null);
  const rules = blocks[activeFocus].rules;

  return (
    <div className="lunch-rules">
      <p className="lunch-note">
        <strong>
          {FOCUS_LABELS[activeFocus]}：{STATION_DESC[activeFocus]}
        </strong>
        <br />
        把积木块拖到「{START_LABEL[activeFocus]}」下面才会生效；同一站按从上到下的顺序执行。
      </p>

      <div className="lunch-block-tabs" role="group" aria-label="选择要编辑的站">
        {FOCUSES.map((focus) => (
          <button
            aria-pressed={focus === activeFocus}
            className={`lunch-block-tab${focus === activeFocus ? " active" : ""}`}
            disabled={disabled}
            key={focus}
            onClick={() => setActiveFocus(focus)}
            type="button"
          >
            {FOCUS_LABELS[focus]}
          </button>
        ))}
      </div>
      <BlocklyRuleEditor
        blocks={blocks}
        disabled={disabled}
        focus={activeFocus}
        onChange={onChange}
        onMessage={setMessage}
      />
      {message ? (
        <p className="lunch-note" role="status">
          {message}
        </p>
      ) : null}

      <LogicExplainer focus={activeFocus} rules={rules} />
    </div>
  );
}
