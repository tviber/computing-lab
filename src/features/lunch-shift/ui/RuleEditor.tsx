/**
 * Ordered rule-list editor — the React counterpart of the Blockly
 * workspace in the standalone version. Semantics are identical: rules
 * attach under the station's start statement and run top-down; the saved
 * draft is the rules array only.
 */

import { useState } from "react";
import { Icon } from "../../../shared/ui/Icon";
import {
  defaultRule,
  ruleLabel,
  ruleTypesFor,
} from "../domain/blockStrategy.ts";
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

/** Compact port of the kitchen logic explainers: what the rules do. */
function LogicExplainer({ focus, rules }: { focus: Focus; rules: BlockRule[] }) {
  if (focus === "intake") {
    const notes = rules.filter((rule) => rule.type === "note");
    const synonyms = rules.filter((rule) => rule.type === "synonym");
    const builtIn = ["不要香菜", "少辣", "加蛋"];
    return (
      <div className="lunch-logic">
        {synonyms.length > 0 ? (
          <p className="lunch-logic-normalize">
            <b>先认不同说法：</b>
            {synonyms
              .map((rule) => `「${rule.phrase ?? ""}」按「${String(rule.value ?? "")}」理解`)
              .join("；")}
          </p>
        ) : null}
        <ol className="lunch-logic-branches">
          {notes.map((rule, index) => (
            <li key={`note-${index}`}>
              <b>{index ? "否则如果" : "如果"}</b>
              <span>
                原话包含「{rule.phrase ?? ""}」→ 小票备注记为「{String(rule.value ?? "")}」
              </span>
            </li>
          ))}
          {builtIn.map((phrase, index) => (
            <li key={phrase}>
              <b>{notes.length || index ? "否则如果" : "如果"}</b>
              <span>原话包含「{phrase}」→ 小票备注记为「{phrase}」</span>
            </li>
          ))}
          <li className="lunch-logic-fallback">
            <b>否则</b>
            <span>小票备注记为「无备注」</span>
          </li>
        </ol>
        <p className="lunch-note">
          你接入的备注规则先检查；都没命中，再检查系统自带的三种说法。系统原本不认识「不放香菜」——没加规则时会写成「无备注」，厨师就可能按标准配方放香菜。
        </p>
      </div>
    );
  }
  const activeRules = rules.filter((rule) => rule.type !== "aged_urgent");
  const agingRules = rules.filter((rule) => rule.type === "aged_urgent");
  return (
    <div className="lunch-logic">
      {agingRules.length > 0 ? (
        <p className="lunch-logic-normalize">
          <b>比较前先更新等待状态：</b>
          {agingRules.map((rule) => ruleLabel(rule)).join("；")}。还需要接入「加急订单优先」，这些订单才会因此排前面。
        </p>
      ) : null}
      {activeRules.length > 0 ? (
        <ol className="lunch-logic-branches">
          {activeRules.map((rule, index) => (
            <li key={`rule-${index}`}>
              <b>第 {index + 1} 条</b>
              <span>{ruleLabel(rule)}</span>
            </li>
          ))}
        </ol>
      ) : null}
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
                  onChange={(next) =>
                    update(rules.map((item, i) => (i === index ? next : item)))
                  }
                  rule={rule}
                />
              </span>
              <span className="lunch-rule-actions">
                <button
                  aria-label="上移"
                  disabled={disabled || index === 0}
                  onClick={() =>
                    update(rules.map((item, i) => (i === index - 1 ? rule : i === index ? rules[index - 1] : item)))
                  }
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label="下移"
                  disabled={disabled || index === rules.length - 1}
                  onClick={() =>
                    update(rules.map((item, i) => (i === index + 1 ? rule : i === index ? rules[index + 1] : item)))
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
