/**
 * Blockly rule editor — the kitchen UX ported to the lab. Rules attach
 * under the station's start block and run top-down; the saved draft is
 * the rules array plus workspace JSON for restoring the canvas.
 */

import { useState } from "react";
import { FOCUSES, FOCUS_LABELS, type BlockDrafts, type Focus } from "../domain/contracts.ts";
import { BlocklyRuleEditor } from "./BlocklyRuleEditor.tsx";

const STATION_DESC: Record<Focus, string> = {
  intake: "把顾客原话整理成小票。",
  kitchen: "每口灶空出来时，系统只从待做订单里选一张。",
  delivery: "出餐员空闲后，只从已经做好的餐里选一份送出。",
};

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
    </div>
  );
}
