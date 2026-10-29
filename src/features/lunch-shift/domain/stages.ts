/**
 * Stage table for the lunch-shift lab. Four stages for one class period:
 * walk one order by hand → fix intake by editing word tables → fix
 * queueing by writing priority() → one-shot graded run on hidden orders.
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
    task: "词表沿用第二关，这里只编辑 priority 函数。换了一批写法不同的订单，只能交一次。",
    judgeNote:
      "服务器用同一套判法跑 12 张隐藏订单：成绩 = 小票正确数 + 记对且准时数（加急等满 9 拍、普通等满 18 拍算超时），满分 24。",
    takeaway: "选通用词的词表，才扛得住换说法。",
    hints: [
      "练习里照抄原话加的词，正式订单换个说法就可能认不出。",
      "又长又具体的练习原话，正式订单换个说法就认不出，换成更短的通用词。",
      "哪张表里还有只在练习原话里出现过的长词？换成更通用的。",
    ],
  },
];

export function getLunchStage(index: number): LunchStageDef | undefined {
  return LUNCH_STAGES.find((stage) => stage.index === index);
}

/** Linear unlock: a stage opens once the previous one passed. */
export function lunchStageUnlocked(passedStages: readonly number[], index: number): boolean {
  return index === 1 || passedStages.includes(index - 1);
}

export function nextLunchStage(passedStages: readonly number[]): number {
  for (const stage of LUNCH_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return LUNCH_STAGES.length + 1;
}
