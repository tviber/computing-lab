/**
 * Stage table for the lunch-shift lab. Four stages for one class period:
 * walk one order by hand → fix intake by editing word tables → fix
 * queueing by writing priority() → graded run on hidden orders.
 * Stage 5 is an optional bonus that rides the stage-3 slot in the rail.
 *
 * Each stage keeps one task sentence. The judging method and the takeaway
 * are only shown after the stage is passed; `hints` are the three
 * self-opened levels (direction → first code line → observation question).
 */

export type LunchStageDef = {
  index: number;
  id: string;
  title: string;
  task: string;
  judgeNote: string;
  takeaway: string;
  /** Self-opened hint levels — omitted where the task needs none. */
  hints?: [string, string, string];
};

export const LUNCH_STAGES: LunchStageDef[] = [
  {
    index: 1,
    id: "order-journey",
    title: "订单旅程",
    task: "把顾客的话记成小票，选好先做哪张，再把餐送到正确的桌。",
    judgeNote: "服务器核对小票四个字段、先做哪张和送到的桌号，全对才算过。",
    takeaway: "小票是数据：一旦系统中某个环节出错，后面的流程全部跟着错。",
  },
  {
    index: 2,
    id: "fix-intake",
    title: "修接单",
    task: "有 12 句顾客原话。根据下面的内容设计各种信号词，让 12 张小票全部记对。",
    judgeNote: "服务器拿你算出的四张词表重新读这 12 张原话，小票全对才过关。",
    takeaway: "认得全比背得多重要，通用词才盖得住没见过的说法。",
  },
  {
    index: 3,
    id: "fix-queue",
    title: "修排队",
    task: "这一关小票都录对了。写 priority(urgent, wait, cook)，返回值越大越先做；加急单等满 9 拍、普通单等满 18 拍还没送到就算超时，至少 10 张准时过关。",
    judgeNote: "服务器拿你的结果表重排每一拍的选择：准时 10 张过关，12 张加星。",
    takeaway: "只认加急会饿死普通单，等太久的也该优先。",
    hints: [
      "加急的单，返回一个更大的数。",
      "第一行可以这样开头：if urgent: score = 1。",
      "超时的是加急单还是普通单？它等了几拍？加急给几分、等太久给几分，谁该更大？",
    ],
  },
  {
    index: 4,
    id: "final-run",
    title: "正式挑战",
    task: "词表沿用第二关，这里只编辑 priority 函数。换了一批写法不同的订单，合计至少 18 分过关，没过可以改了再交。",
    judgeNote:
      "服务器用同一套判法跑 12 张隐藏订单：成绩 = 小票正确数 + 记对且准时数（加急等满 9 拍、普通等满 18 拍算超时），满分 24，至少 18 分过关。",
    takeaway: "选通用词的词表，才扛得住换说法。",
    hints: [
      "练习里照抄原话加的词，正式订单换个说法就可能认不出。",
      "又长又具体的练习原话，正式订单换个说法就认不出，换成更短的通用词。",
      "哪张表里还有只在练习原话里出现过的长词？换成更通用的。",
    ],
  },
  {
    index: 5,
    id: "compensate",
    title: "附加挑战",
    task: "晚高峰 20 单按先来先做跑完，有的单送晚了、有的没送到。写 compensate(urgent, overtime, delivered) 给每张出问题的单选补偿：0 不补偿、1 送小食（2 元）、2 部分退款（15 元）。照店里的差评率表估计，预计差评不超过 4.5 单、补偿花费不超过 80 元才过关。",
    judgeNote:
      "服务器用同一套先来先做的跑法找出 11 张问题单，按你的结果表逐张查差评率和花费：两条线都压住才算过。",
    takeaway: "信息系统不只执行规则，也在做权衡：补偿太少伤顾客，补偿太多伤成本。",
    hints: [
      "差评率最高的是「没送到」的单，先把 delivered 为 False 的处理好。",
      "第一行可以这样开头：if not delivered: return 2。",
      "退款一张 15 元，预算退不起 6 张没送到的：先退哪一种更划算？看差评率表里的加急行。",
    ],
  },
];

export function getLunchStage(index: number): LunchStageDef | undefined {
  return LUNCH_STAGES.find((stage) => stage.index === index);
}

/**
 * Stage-4 pass line, shared by the judge and the result view. On the hidden
 * set, generalizing word tables score ≥ 20 even under FIFO while literal
 * practice-only tables cap at 16 — 18 splits "words carried over" from
 * "didn't generalize" without re-testing stage-3 queueing skill.
 */
export const FINAL_PASS_SCORE = 18;

/** Linear unlock: a stage opens once the previous one passed. */
export function lunchStageUnlocked(passedStages: readonly number[], index: number): boolean {
  // 附加挑战 rides alongside the formal challenge: passing priority is
  // all it needs.
  if (index === 5) return passedStages.includes(3);
  return index === 1 || passedStages.includes(index - 1);
}

export function nextLunchStage(passedStages: readonly number[]): number {
  for (const stage of LUNCH_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return LUNCH_STAGES.length + 1;
}
