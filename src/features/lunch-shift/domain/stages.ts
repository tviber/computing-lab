/**
 * Stage table for the lunch-shift lab. The four stages replay the
 * classroom flow from kitchen/README.md: walk one order by hand →
 * recognize the five system elements → tune the rules against the
 * practice set → one-shot graded run on the hidden final set.
 */

export type LunchStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  description: string;
  task: string;
  hint: string;
  judgeNote: string;
  takeaway: string;
};

export const LUNCH_STAGES: LunchStageDef[] = [
  {
    index: 1,
    id: "order-journey",
    title: "订单旅程",
    englishTitle: "One Order by Hand",
    description:
      "你现在是餐馆值班员。厨房不直接听顾客说话，只认你记的小票；菜名或桌号写错一个，餐就可能做错、送错。",
    task: "把顾客的原话记成小票，选先做哪张订单，再核对小票把餐送到正确的桌。",
    hint: "顾客说「不赶时间」就是普通单；送餐时桌号要和小票上写的一字不差。",
    judgeNote: "服务器检查小票字段和送达桌号是否全部正确。",
    takeaway: "订单 = 数据：字段错一个，后面的流程全跟着错。",
  },
  {
    index: 2,
    id: "system-check",
    title: "认识信息系统",
    englishTitle: "Five Elements",
    description:
      "硬件、软件、网络、数据、用户——一个小型信息系统由这五部分组成。想想刚才那张订单分别经过了谁。",
    task: "答对全部 6 道检查题，再用四句话分别写清：谁提出需求、经过哪里、谁运行软件、结果交给谁。",
    hint: "你写下的规则只是数据；照着规则一条条执行的是服务器上运行的程序。",
    judgeNote: "6 题全对、四步说明都填写才算通过；答错可以再试。",
    takeaway: "规则是数据，执行靠程序；数据经网络在设备和服务器之间往返。",
  },
  {
    index: 3,
    id: "rule-practice",
    title: "规则练习",
    englishTitle: "Practice Run",
    description:
      "给接单、厨房、出餐三站定下处理规则——例如认出「桌 7」这样的写法，或让加急单先处理。规则接在起始语句下面、按从上到下的顺序生效。",
    task: "编辑三站规则后试运行：系统按你的规则处理 12 张订单，看能拿多少分（目标 77 分）。可以先做加餐实验观察瓶颈转移。",
    hint: "顾客说「不放香菜」时，默认程序会写成「无备注」——加一条备注规则就能认出它。",
    judgeNote: "每次试运行都由服务器记录一次成绩；通过后即可进入正式挑战。",
    takeaway: "同一批订单，规则不同结果就不同——瓶颈会随配置搬家。",
  },
  {
    index: 4,
    id: "final-run",
    title: "正式挑战",
    englishTitle: "Final Run",
    description: "换了一批 12 张订单。你可以最后再调整三站规则，但正式成绩只提交一次——看清楚再按。",
    task: "确认规则和优化焦点，提交唯一的正式成绩。",
    hint: "正式订单的写法可能和练习不一样：认得全比跑得快更值钱（小票全对 50 分）。",
    judgeNote: "服务器用另一套隐藏订单判定；提交后不能再改。",
    takeaway: "识别正确、送达准时、等待够短，三者合起来才是好成绩。",
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
