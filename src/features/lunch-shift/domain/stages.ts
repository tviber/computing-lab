export type LunchStageDef = {
  index: number;
  id: string;
  title: string;
  task: string;
  judgeNote: string;
  takeaway: string;
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
    id: "ai-intake",
    title: "智能接单",
    task: "店里装了 AI 接单台：顾客说一句原话，本地模型直接记出小票，还给两个把握度分数 similarity 和 margin。可它也会听错：有 12 张练习订单带正确答案，写 need_confirm(similarity, margin) 挑出拿不准的单让顾客再确认一遍，确认的单一定记对。记对 12 张、确认不超过 4 次过关。",
    judgeNote:
      "服务器把你标记确认的单按正确答案记，没确认的单用 AI 的结果重新核对这 12 张订单：12 张全对且确认 ≤4 次才过关。",
    takeaway:
      "AI 能听懂没见过的说法，但它会拿不准。现代信息系统靠的不是 AI 永远对，而是知道什么时候该再问一遍。",
    hints: [
      "similarity 低说明 AI 拿不准，margin 小说明前两名差不多，先找出最没把握的那几单。",
      "第一行可以这样开头：if similarity < 0.75: return True。",
      "确认有预算：哪两单的分数最低？把确认留给他们，别浪费在 AI 本来就有把握的单上。",
    ],
  },
  {
    index: 3,
    id: "fix-queue",
    title: "修排队",
    task: "这一关小票都录对了。复习函数：写 priority(urgent, wait, cook)，返回值越大越先做。店里的排单规定：算算每张单还剩几拍就超时（加急单 9 拍、普通单 18 拍，减掉已经等的），剩下最少的先做；一样少就先来先做。这次先按剩余等待时间排单，制作时间 cook 这一关不参与计算。服务器拿 12 张排队情况卡判你的函数有没有把这条规定写对：每张卡给几张在等的单，答对 11 张过关，12 张全对加星。",
    judgeNote:
      "服务器把你的结果表带进 12 张情况卡逐张判：只看加急会饿死普通单，只认等待会饿死加急，两边都用上才够 11 张。",
    takeaway: "只认加急会饿死普通单，只认等待会饿死加急，最等不起的先做。",
    hints: [
      "加急的单，返回一个更大的数。",
      "第一行可以这样开头：if urgent: score = 1。",
      "店里的规定是谁剩得最少谁先做：加急剩 9−wait 拍，普通剩 18−wait 拍，一样多就先到先做。",
    ],
  },
  {
    index: 4,
    id: "dinner-rush",
    title: "晚餐高峰",
    task: "正式营业：12 张陌生订单进来，接单和排队要一起扛。同一台 AI 接单（你的 need_confirm 直接沿用），光一个付费加急就有「要加急」「付费加快」「加钱走急单」好几种说法。确认的单一律记对但停 1 拍，记错或迟到都算事故：小票 12 张全对、确认不超过 4 次、记对且准时至少 11 张才过关。",
    judgeNote:
      "服务器把你标记确认的单按顾客复述记对（确认必对），没确认的单用 AI 的结果，再把所有小票放进第三关的队列模拟：12 张全对、确认 ≤4 次且记对且准时 ≥11 张才过关。",
    takeaway:
      "真实系统里准确率、成本和速度是连在一起的：多问一句要花钱，记错一张要出事，排队函数也要兜住接单台停下来的拍子。",
    hints: [
      "先让 AI 跑一遍，找出 similarity 或 margin 最低的那几单，确认预算留给他们。",
      "确认停 1 拍可能把本来准时的单拖晚：哪些单确认得起，哪些确认不起？",
      "准时差一点就调第三关的 priority：等太久的单优先，确认停过的单别让它饿死。",
    ],
  },
  {
    index: 5,
    id: "compensate",
    title: "附加挑战",
    task: "晚高峰 20 单按先来先做跑完，有的单送晚了、有的没送到。写 compensate(urgent, overtime, delivered, price) 给每张出问题的单选补偿：0 不补偿、1 送小食（2 元）、2 退款（送到的退一半，没送到的全退）。照店里的差评率表估计，预计差评不超过 4 单、补偿花费不超过 70 元才过关。",
    judgeNote:
      "服务器用同一套先来先做的跑法找出 11 张问题单，按你的结果表逐张查差评率和花费：两条线都压住才算过。",
    takeaway: "信息系统不只执行规则，也在做权衡：补偿太少伤顾客，补偿太多伤成本。",
    hints: [
      "差评率最高的是「没送到」的单，但全退一张牛肉面要 22 元，预算装不下几张。",
      "第一行可以这样开头：if not delivered and price <= 12: return 2。",
      "送到的单退款只要半价：比一比「每元降多少差评」，退哪几张最划算？",
    ],
  },
];

export function getLunchStage(index: number): LunchStageDef | undefined {
  return LUNCH_STAGES.find((stage) => stage.index === index);
}

export const AI_PASS_CORRECT = 12;
export const AI_CONFIRM_BUDGET = 4;
export const AI_SERVED_MIN = 11;

export const QUEUE_PASS = 11;

function lunchStagePrerequisite(index: number): number {
  return index === 5 ? 3 : index - 1;
}

export function lunchStageUnlocked(passedStages: readonly number[], index: number): boolean {
  return index === 1 || passedStages.includes(lunchStagePrerequisite(index));
}

export function lunchStageAffectedByReset(fromStage: number, stageIndex: number): boolean {
  for (let index = stageIndex; index > 0; index = lunchStagePrerequisite(index)) {
    if (index === fromStage) return true;
  }
  return false;
}

export function nextLunchStage(passedStages: readonly number[]): number {
  for (const stage of LUNCH_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return LUNCH_STAGES.length + 1;
}
