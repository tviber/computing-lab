/**
 * Blockly rule editor — port of kitchen's block-editor.js. Rules attach
 * under a fixed root block ("收到顾客订单" / "选择下一张订单") and run
 * top-down; the saved draft is the workspace JSON plus the normalized
 * rules array the simulator consumes.
 */

import { ruleLabel } from "../domain/blockStrategy.ts";
import type { BlockRule, Focus } from "../domain/contracts.ts";

export type BlocklyDraft = { workspace: string; rules: BlockRule[] };

declare const Blockly: any;

/** Loads the vendored Blockly runtime once (scripts live in public/vendor). */
let loader: Promise<void> | null = null;
export function loadBlockly(): Promise<void> {
  if (typeof Blockly !== "undefined") return Promise.resolve();
  loader ??= new Promise<void>((resolve, reject) => {
    const load = (src: string) =>
      new Promise<void>((done, fail) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => done();
        script.onerror = () => fail(new Error(`加载失败：${src}`));
        document.head.appendChild(script);
      });
    load("/vendor/blockly/blockly_compressed.js")
      .then(() => load("/vendor/blockly/msg/zh-hans.js"))
      .then(resolve, reject);
  });
  return loader;
}

let defined = false;
function defineBlocks() {
  if (defined) return;
  Blockly.Extensions.register("limit_phrase", function (this: any) {
    this.getField("PHRASE").setValidator((value: string) => value.slice(0, 20));
  });
  Blockly.Extensions.register("limit_value", function (this: any) {
    this.getField("VALUE").setValidator((value: string) => value.slice(0, 20));
  });
  Blockly.defineBlocksWithJsonArray([
    {
      type: "order_start",
      message0: "收到顾客订单 %1",
      args0: [{ type: "input_statement", name: "RULES", check: "order_rule" }],
      colour: 18,
    },
    {
      type: "queue_start",
      message0: "选择下一张订单 %1",
      args0: [{ type: "input_statement", name: "RULES", check: "queue_rule" }],
      colour: 165,
    },
    {
      type: "order_note",
      message0: "如果原话包含 %1，就把小票备注设为 %2",
      args0: [
        { type: "field_input", name: "PHRASE", text: "不放香菜", maxLength: 20 },
        {
          type: "field_dropdown",
          name: "VALUE",
          options: [
            ["不要香菜", "不要香菜"],
            ["少辣", "少辣"],
            ["加蛋", "加蛋"],
            ["无备注", "无备注"],
          ],
        },
      ],
      previousStatement: "order_rule",
      nextStatement: "order_rule",
      colour: 28,
      extensions: ["limit_phrase"],
    },
    {
      type: "order_table",
      message0: "识别“桌 7 / 桌号 7”这样的桌号",
      previousStatement: "order_rule",
      nextStatement: "order_rule",
      colour: 28,
    },
    {
      type: "order_urgent",
      message0: "原话包含 %1 → 订单设为 %2",
      args0: [
        { type: "field_input", name: "PHRASE", text: "不赶时间", maxLength: 20 },
        {
          type: "field_dropdown",
          name: "VALUE",
          options: [
            ["普通", "false"],
            ["加急", "true"],
          ],
        },
      ],
      previousStatement: "order_rule",
      nextStatement: "order_rule",
      colour: 28,
      extensions: ["limit_phrase"],
    },
    {
      type: "queue_priority",
      message0: "如果是 %1 ，就先做",
      args0: [
        {
          type: "field_dropdown",
          name: "VALUE",
          options: [
            ["加急单", "priority_urgent"],
            ["等得最久的", "priority_longest"],
            ["来得最早的", "priority_first"],
            ["做得快的", "priority_shortest"],
            ["普通单", "priority_normal"],
            ["达到准时上限的订单", "priority_deadline"],
            ["牛肉面", "牛肉面"],
            ["鸡腿饭", "鸡腿饭"],
            ["蛋炒饭", "蛋炒饭"],
          ],
        },
      ],
      previousStatement: "queue_rule",
      nextStatement: "queue_rule",
      colour: 145,
    },
    {
      type: "queue_priority_send",
      message0: "如果是 %1 ，就先送",
      args0: [
        {
          type: "field_dropdown",
          name: "VALUE",
          options: [
            ["加急单", "priority_urgent"],
            ["等得最久的", "priority_longest"],
            ["来得最早的", "priority_first"],
            ["桌号小的", "priority_table"],
            ["普通单", "priority_normal"],
            ["达到准时上限的订单", "priority_deadline"],
            ["牛肉面", "牛肉面"],
            ["鸡腿饭", "鸡腿饭"],
            ["蛋炒饭", "蛋炒饭"],
          ],
        },
      ],
      previousStatement: "queue_rule",
      nextStatement: "queue_rule",
      colour: 145,
    },
    {
      type: "order_hold",
      message0: "如果菜品或桌号没认出，就拦下不进厨房",
      previousStatement: "order_rule",
      nextStatement: "order_rule",
      colour: 8,
    },
    {
      type: "queue_wait",
      message0: "如果等了 %1 拍，就先处理",
      args0: [{ type: "field_number", name: "TICKS", value: 8, min: 1, max: 30, precision: 1 }],
      previousStatement: "queue_rule",
      nextStatement: "queue_rule",
      colour: 145,
    },
    {
      type: "queue_short",
      message0: "如果做得快，就先处理",
      previousStatement: "queue_rule",
      nextStatement: "queue_rule",
      colour: 145,
    },
    {
      type: "order_synonym",
      message0: "顾客说 %1 也算 %2",
      args0: [
        { type: "field_input", name: "PHRASE", text: "不放香菜" },
        { type: "field_input", name: "VALUE", text: "不要香菜" },
      ],
      previousStatement: "order_rule",
      nextStatement: "order_rule",
      colour: 8,
      extensions: ["limit_phrase", "limit_value"],
    },
    {
      type: "queue_aged",
      message0: "如果等了 %1 拍，就算作加急",
      args0: [{ type: "field_number", name: "TICKS", value: 8, min: 1, max: 30, precision: 1 }],
      previousStatement: "queue_rule",
      nextStatement: "queue_rule",
      colour: 120,
    },
    {
      type: "queue_item_cook",
      message0: "如果是 %1，就先做",
      args0: [
        {
          type: "field_dropdown",
          name: "VALUE",
          options: [
            ["牛肉面", "牛肉面"],
            ["鸡腿饭", "鸡腿饭"],
            ["蛋炒饭", "蛋炒饭"],
          ],
        },
      ],
      previousStatement: "queue_rule",
      nextStatement: "queue_rule",
      colour: 120,
    },
    {
      type: "queue_item_send",
      message0: "如果是 %1，就先送",
      args0: [
        {
          type: "field_dropdown",
          name: "VALUE",
          options: [
            ["牛肉面", "牛肉面"],
            ["鸡腿饭", "鸡腿饭"],
            ["蛋炒饭", "蛋炒饭"],
          ],
        },
      ],
      previousStatement: "queue_rule",
      nextStatement: "queue_rule",
      colour: 120,
    },
  ]);
  defined = true;
}

function ruleFromBlock(block: any): BlockRule | null {
  if (block.type === "order_note")
    return {
      type: "note",
      phrase: String(block.getFieldValue("PHRASE")),
      value: String(block.getFieldValue("VALUE")),
    };
  if (block.type === "order_table") return { type: "table_prefix" };
  if (block.type === "order_urgent")
    return {
      type: "urgent_phrase",
      phrase: String(block.getFieldValue("PHRASE")),
      value: block.getFieldValue("VALUE") === "true",
    };
  if (block.type === "queue_wait")
    return { type: "priority_wait", ticks: Number(block.getFieldValue("TICKS")) };
  if (block.type === "queue_short") return { type: "priority_shortest" };
  if (block.type === "order_synonym")
    return {
      type: "synonym",
      phrase: String(block.getFieldValue("PHRASE")),
      value: String(block.getFieldValue("VALUE")),
    };
  if (block.type === "queue_aged")
    return { type: "aged_urgent", ticks: Number(block.getFieldValue("TICKS")) };
  if (block.type === "queue_item_cook" || block.type === "queue_item_send")
    return { type: "priority_item", value: String(block.getFieldValue("VALUE")) };
  if (block.type === "queue_priority" || block.type === "queue_priority_send") {
    const value = String(block.getFieldValue("VALUE"));
    return ["牛肉面", "鸡腿饭", "蛋炒饭"].includes(value)
      ? { type: "priority_item", value }
      : ({ type: value } as BlockRule);
  }
  if (block.type === "order_hold") return { type: "hold_bad" };
  return null;
}

export type BlocklyEditorHandle = {
  snapshot: () => BlocklyDraft;
  dispose: () => void;
};

export function mountBlockEditor(
  container: HTMLElement,
  focus: Focus,
  initial: { workspace?: string; rules?: BlockRule[] } | null,
  onChange: (draft: BlocklyDraft, message: string) => void,
): BlocklyEditorHandle {
  defineBlocks();
  const startType = focus === "intake" ? "order_start" : "queue_start";
  const blockTypes =
    focus === "intake"
      ? ["order_note", "order_table", "order_urgent", "order_hold"]
      : focus === "kitchen"
        ? ["queue_priority", "queue_wait"]
        : ["queue_priority_send", "queue_wait"];
  const advancedTypes =
    focus === "intake"
      ? ["order_synonym"]
      : focus === "kitchen"
        ? ["queue_aged", "queue_item_cook"]
        : ["queue_aged", "queue_item_send"];
  const workspace = Blockly.inject(container, {
    toolbox: {
      kind: "flyoutToolbox",
      contents: [
        ...blockTypes.map((type) => ({ kind: "block", type })),
        { kind: "label", text: "加餐：做完上面再试" },
        ...advancedTypes.map((type) => ({ kind: "block", type })),
      ],
    },
    media: "/vendor/blockly/media/",
    sounds: false,
    trashcan: true,
    maxBlocks: 13,
    scrollbars: true,
    zoom: { controls: true, wheel: false, startScale: 0.9, minScale: 0.6, maxScale: 1.2 },
  });

  const savedWorkspace = initial && typeof initial.workspace === "string" ? initial.workspace : "";
  const savedRules = initial && Array.isArray(initial.rules) ? initial.rules : [];
  let restored = false;
  if (savedWorkspace) {
    try {
      Blockly.serialization.workspaces.load(JSON.parse(savedWorkspace), workspace);
      restored =
        workspace.getTopBlocks(false).filter((block: any) => block.type === startType).length === 1;
    } catch (loadError) {
      console.error("规则草稿恢复失败", loadError);
      restored = false;
    }
    if (!restored) {
      workspace.dispose();
      throw new Error("保存的规则没能打开，原规则还在服务器上。请刷新页面重试。");
    }
  } else if (savedRules.length) {
    // Rules without a workspace blob (e.g. an older list-editor draft):
    // rebuild them under the root so nothing is lost.
    workspace.clear();
    const root = workspace.newBlock(startType);
    root.initSvg();
    root.render();
    root.moveBy(28, 28);
    let tail: any = null;
    const attach = (type: string, values: Record<string, unknown>) => {
      const block = workspace.newBlock(type);
      block.initSvg();
      block.render();
      for (const [field, value] of Object.entries(values)) {
        if (block.getField(field)) block.setFieldValue(String(value), field);
      }
      if (tail?.nextConnection) tail.nextConnection.connect(block.previousConnection);
      else root.getInput("RULES")?.connection?.connect(block.previousConnection);
      tail = block;
    };
    for (const rule of savedRules) {
      if (rule.type === "note") attach("order_note", { PHRASE: rule.phrase, VALUE: rule.value });
      else if (rule.type === "table_prefix") attach("order_table", {});
      else if (rule.type === "urgent_phrase")
        attach("order_urgent", { PHRASE: rule.phrase, VALUE: String(rule.value) });
      else if (rule.type === "priority_wait") attach("queue_wait", { TICKS: rule.ticks });
      else if (rule.type === "priority_shortest") attach("queue_short", {});
      else if (rule.type === "synonym")
        attach("order_synonym", { PHRASE: rule.phrase, VALUE: rule.value });
      else if (rule.type === "aged_urgent") attach("queue_aged", { TICKS: rule.ticks });
      else if (rule.type === "priority_item")
        attach(focus === "kitchen" ? "queue_item_cook" : "queue_item_send", { VALUE: rule.value });
      else if (rule.type === "hold_bad") attach("order_hold", {});
      else if (rule.type === "priority_table")
        attach(focus === "kitchen" ? "queue_priority" : "queue_priority_send", {
          VALUE: "priority_table",
        });
      else if (rule.type.startsWith("priority_"))
        attach(focus === "kitchen" ? "queue_priority" : "queue_priority_send", {
          VALUE: rule.type,
        });
    }
  } else {
    workspace.clear();
    const root = workspace.newBlock(startType);
    root.initSvg();
    root.render();
    root.moveBy(28, 28);
  }
  const root = workspace.getTopBlocks(false).find((block: any) => block.type === startType);
  root.setDeletable(false);
  root.setMovable(false);

  const snapshot = (): BlocklyDraft => {
    const rules: BlockRule[] = [];
    let block = root.getInputTargetBlock("RULES");
    while (block && rules.length < 12) {
      if (typeof block.isEnabled !== "function" || block.isEnabled()) {
        const rule = ruleFromBlock(block);
        if (rule) rules.push(rule);
      }
      block = block.getNextBlock();
    }
    return {
      workspace: JSON.stringify(Blockly.serialization.workspaces.save(workspace)),
      rules,
    };
  };

  let previousRules = snapshot().rules;
  let disposing = false;
  let eventTimer = 0;
  const publishChange = () => {
    eventTimer = 0;
    if (disposing) return;
    const draft = snapshot();
    const rules = draft.rules;
    const incomplete = rules.some(
      (rule) =>
        (rule.type === "note" || rule.type === "urgent_phrase" || rule.type === "synonym") &&
        (!String(rule.phrase ?? "").trim() ||
          (rule.type === "synonym" && !String(rule.value ?? "").trim())),
    );
    const changed = JSON.stringify(rules) !== JSON.stringify(previousRules);
    const orphans = workspace.getTopBlocks(false).length - 1;
    const summary = rules.length
      ? `已生效 ${rules.length} 条：${rules.map((rule) => ruleLabel(rule)).join("；")}`
      : "还没有语句接在起始语句下面，现在按原来的方式处理";
    const orphanNote = orphans > 0 ? `；有 ${orphans} 条语句没接上，不会生效` : "";
    const message = !changed
      ? `${summary}${orphanNote}。`
      : incomplete
        ? `有一条规则需要填写关键词，空关键词不会生效。${summary}${orphanNote}。`
        : rules.length > previousRules.length
          ? `规则已接入！${summary}${orphanNote}。试运行看看订单的变化。`
          : rules.length < previousRules.length
            ? `规则已移除；${summary}${orphanNote}。`
            : `规则已更新；${summary}${orphanNote}。试运行后就能看到它对订单的影响。`;
    previousRules = rules;
    onChange(draft, message);
  };
  workspace.addChangeListener((event: any) => {
    if (disposing || event.isUiEvent) return;
    if (!eventTimer) eventTimer = window.setTimeout(publishChange, 50);
  });
  const resize = new ResizeObserver(() => Blockly.svgResize(workspace));
  resize.observe(container);
  Blockly.svgResize(workspace);
  return {
    snapshot,
    dispose() {
      if (eventTimer) {
        window.clearTimeout(eventTimer);
        publishChange();
      }
      disposing = true;
      resize.disconnect();
      workspace.dispose();
    },
  };
}
