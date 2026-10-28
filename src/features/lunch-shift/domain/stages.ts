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
  hints: [string, string, string];
};

export const LUNCH_STAGES: LunchStageDef[] = [
  {
    index: 1,
    id: "order-journey",
    title: "订单旅程",
    task: "把顾客的话记成小票，选好先做哪张，再把餐送到正确的桌。",
    judgeNote: "服务器核对小票四个字段、先做哪张和送到的桌号，全对才算过。",
    takeaway: "小票是数据：一个字段错，后面全跟着错。",
    hints: [
      "顾客说「不赶时间」就是普通单；说赶时间才是加急。",
      "送餐那一步不用多想：小票上写几号桌，就送几号桌。",
      "哪一步卡住了？是小票写错了，还是桌号选错了？",
    ],
  },
  {
    index: 2,
    id: "fix-intake",
    title: "修接单",
    task: "程序只认词表里的词。改词表，让 12 张订单的小票全部记对。",
    judgeNote: "服务器拿你算出的四张词表重新读这 12 张原话，小票全对才过关。",
    takeaway: "认得全比背得多重要——通用词才盖得住没见过的说法。",
    hints: [
      "只看错的那几单：每单错的那个字段，在原话里换了什么说法？",
      "往对应的表里加一个词就行，比如 note_words 里加一行「不放香菜: 不要香菜」。也可以选更短的通用词，一次盖住几种写法。",
      "「不用赶时间」被当成加急了——它命中了 rush_words 里的哪个词？该往哪张表加词，才能让 calm_words 先把它拦下来？",
    ],
  },
  {
    index: 3,
    id: "fix-queue",
    title: "修排队",
    task: "这一关小票都录对了。写 priority(urgent, wait, cook)，返回的数越大越先做——让 10 张以上订单准时送达。",
    judgeNote: "服务器拿你的结果表重排每一拍的选择：准时 10 张过关，12 张加星。",
    takeaway: "只认加急会饿死普通单——等太久的，也该优先。",
    hints: [
      "加急的单，返回一个更大的数。",
      "第一行可以这样开头：if urgent: return 1。",
      "超时的是加急单还是普通单？它等了几拍？等太久的普通单，值不值得也算大？",
    ],
  },
  {
    index: 4,
    id: "final-run",
    title: "正式挑战",
    task: "词表和函数已经带过来了。换了一批写法不同的订单，只能交一次。",
    judgeNote: "服务器用同一套判法跑 12 张隐藏订单：成绩 = 小票正确数 + 准时数，满分 24。",
    takeaway: "选通用词的词表，才扛得住换说法。",
    hints: [
      "练习里照抄原话加的词，正式订单换个说法就可能认不出。",
      "把「不放香菜」换成「放香菜」试试——更短的词认得出更多写法。",
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
