/**
 * Ordered rule-list editor — the React counterpart of the Blockly
 * workspace in the standalone version. Semantics are identical: rules
 * attach under the station's start statement and run top-down; the saved
 * draft is the rules array only.
 */

import { useState } from "react";
import { Icon } from "../../../shared/ui/Icon";
import { defaultRule, ruleLabel, ruleTypesFor } from "../domain/blockStrategy.ts";
import {
  DISHES,
  FOCUSES,
  FOCUS_LABELS,
  NOTES,
  type BlockDrafts,
  type BlockRule,
  type Focus,
} from "../domain/contracts.ts";

const MAX_RULES = 12;

const START_LABEL: Record<Focus, string> = {
  intake: "收到顾客订单",
  kitchen: "选择下一张订单",
  delivery: "选择下一张订单",
};

const STATION_DESC: Record<Focus, string> = {
  intake: "把顾客原话整理成小票。",
  kitchen: "每口灶空出来时，系统只从待做订单里选一张。",
  delivery: "出餐员空闲后，只从已经做好的餐里选一份送出。",
};

function RuleParams({
  rule,
  disabled,
  onChange,
}: {
  rule: BlockRule;
  disabled?: boolean;
  onChange: (next: BlockRule) => void;
}) {
  if (rule.type === "note") {
    return (
      <>
        原话包含
        <input
          className="lunch-rule-input"
          disabled={disabled}
          maxLength={20}
          onChange={(e) => onChange({ ...rule, phrase: e.target.value })}
          value={rule.phrase ?? ""}
        />
        → 备注
        <select
          className="field-select-inline"
          disabled={disabled}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
          value={String(rule.value ?? NOTES[0])}
        >
          {NOTES.map((note) => (
            <option key={note} value={note}>
              {note}
            </option>
          ))}
        </select>
      </>
    );
  }
  if (rule.type === "urgent_phrase") {
    return (
      <>
        原话包含
        <input
          className="lunch-rule-input"
          disabled={disabled}
          maxLength={20}
          onChange={(e) => onChange({ ...rule, phrase: e.target.value })}
          value={rule.phrase ?? ""}
        />
        → 订单设为
        <select
          className="field-select-inline"
          disabled={disabled}
          onChange={(e) => onChange({ ...rule, value: e.target.value === "true" })}
          value={rule.value === true ? "true" : "false"}
        >
          <option value="true">加急</option>
          <option value="false">普通</option>
        </select>
      </>
    );
  }
  if (rule.type === "synonym") {
    return (
      <>
        原话中的
        <input
          className="lunch-rule-input"
          disabled={disabled}
          maxLength={20}
          onChange={(e) => onChange({ ...rule, phrase: e.target.value })}
          value={rule.phrase ?? ""}
        />
        也算
        <input
          className="lunch-rule-input"
          disabled={disabled}
          maxLength={20}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
          value={String(rule.value ?? "")}
        />
      </>
    );
  }
  if (rule.type === "priority_item") {
    return (
      <>
        先做/先送
        <select
          className="field-select-inline"
          disabled={disabled}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
          value={String(rule.value ?? DISHES[0])}
        >
          {DISHES.map((dish) => (
            <option key={dish} value={dish}>
              {dish}
            </option>
          ))}
        </select>
      </>
    );
  }
  if (rule.type === "priority_wait" || rule.type === "aged_urgent") {
    return (
      <>
        等了
        <input
          className="lunch-rule-ticks"
          disabled={disabled}
          max={30}
          min={1}
          onChange={(e) => {
            const ticks = Math.max(1, Math.min(30, Math.trunc(Number(e.target.value) || 1)));
            onChange({ ...rule, ticks });
          }}
          type="number"
          value={rule.ticks ?? 8}
        />
        拍{rule.type === "aged_urgent" ? "的订单算加急" : "的先处理"}
      </>
    );
  }
  return <>{ruleLabel(rule)}</>;
}

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
  const rules = blocks[activeFocus].rules;
  const { basic, advanced } = ruleTypesFor(activeFocus);

  const update = (nextRules: BlockRule[]) => {
    onChange({ ...blocks, [activeFocus]: { rules: nextRules.slice(0, MAX_RULES) } });
  };

  const incomplete = rules.some(
    (rule) =>
      (rule.type === "note" || rule.type === "urgent_phrase" || rule.type === "synonym") &&
      (!rule.phrase?.trim() || (rule.type === "synonym" && !String(rule.value ?? "").trim())),
  );

  return (
    <div className="lunch-rules">
      <div className="lunch-block-tabs" role="group" aria-label="选择要编辑的站">
        {FOCUSES.map((focus) => (
          <button
            aria-pressed={focus === activeFocus}
            className={`lunch-block-tab${focus === activeFocus ? " active" : ""}`}
            key={focus}
            onClick={() => setActiveFocus(focus)}
            type="button"
          >
            {FOCUS_LABELS[focus]}
          </button>
        ))}
      </div>
      <p className="lunch-note">
        <strong>
          {FOCUS_LABELS[activeFocus]}：{STATION_DESC[activeFocus]}
        </strong>
        <br />
        把语句接到「{START_LABEL[activeFocus]}」下面才会生效；同一站按从上到下的顺序执行。
      </p>

      <div className="lunch-start">起始语句：{START_LABEL[activeFocus]}</div>
      {rules.length === 0 ? (
        <p className="lunch-note">还没有语句接在起始语句下面，现在按原来的方式处理。</p>
      ) : (
        <ol className="lunch-rule-list">
          {rules.map((rule, index) => (
            <li className="lunch-rule" key={`${rule.type}-${index}`}>
              <span className="lunch-rule-text">
                <b>第 {index + 1} 条</b>
                <RuleParams
                  disabled={disabled}
                  onChange={(next) => update(rules.map((item, i) => (i === index ? next : item)))}
                  rule={rule}
                />
              </span>
              <span className="lunch-rule-actions">
                <button
                  aria-label="上移"
                  disabled={disabled || index === 0}
                  onClick={() =>
                    update(
                      rules.map((item, i) =>
                        i === index - 1 ? rule : i === index ? rules[index - 1] : item,
                      ),
                    )
                  }
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label="下移"
                  disabled={disabled || index === rules.length - 1}
                  onClick={() =>
                    update(
                      rules.map((item, i) =>
                        i === index + 1 ? rule : i === index ? rules[index + 1] : item,
                      ),
                    )
                  }
                  type="button"
                >
                  ↓
                </button>
                <button
                  aria-label="删除"
                  disabled={disabled}
                  onClick={() => update(rules.filter((_, i) => i !== index))}
                  type="button"
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {!disabled ? (
        <label className="lunch-add-rule">
          添加语句
          <select
            className="field-select"
            disabled={rules.length >= MAX_RULES}
            onChange={(e) => {
              if (!e.target.value) return;
              update([...rules, defaultRule(e.target.value)]);
              e.target.value = "";
            }}
            value=""
          >
            <option value="">选择一条语句…</option>
            {basic.map((type) => (
              <option key={type} value={type}>
                {ruleLabel(defaultRule(type))}
              </option>
            ))}
            <option disabled>── 加餐：做完上面再试 ──</option>
            {advanced.map((type) => (
              <option key={type} value={type}>
                {ruleLabel(defaultRule(type))}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {incomplete ? (
        <p className="lunch-rule-warning" role="status">
          有一条规则需要填写关键词，空关键词不会生效。
        </p>
      ) : null}

      <LogicExplainer focus={activeFocus} rules={rules} />
    </div>
  );
}
