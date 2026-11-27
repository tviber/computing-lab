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
    task: "你是前台接单员。顾客说一句想吃什么，你要把它记成小票，再交给厨房和送餐员。小票写错了也可以继续往下走，看看后面会发生什么。",
    judgeNote:
      "判题程序会核对小票上的菜品、备注、桌号和加急标记，也会核对你把餐送到哪一桌。先做哪张订单都可以，但加急单排在后面会多等几拍。",
    takeaway:
      "厨房照着小票做菜，送餐员照着小票送桌。小票上的字段写错了，后面的人也只能照着错下去。",
  },
  {
    index: 2,
    id: "ai-intake",
    title: "智能接单",
    task: "店里装了 AI 接单台。顾客说一句原话，本地模型会先写出一张小票，再给出两个分数：similarity 表示这次判断和它记住的说法有多接近，margin 表示第一名比第二名领先多少。两个分数都可能偏低。你要写 need_confirm(similarity, margin)，决定哪些单先别出票、请顾客再说一遍。确认过的单一定记对，但接单台会停 1 拍。12 张练习单全部记对，并且确认不超过 4 次，才算过关。",
    judgeNote:
      "判题程序会按你的 need_confirm 重放这 12 张练习单：标了确认的单按顾客复述记对，没标的单沿用 AI 的小票。12 张全对且确认不超过 4 次才过关。",
    takeaway:
      "模型遇到没见过的说法时可能会猜错。系统给顾客留一个再确认的入口，就能把这类错误拦在出票之前。",
    hints: [
      "先看 12 张单里哪些是 AI 真正听错的，再比较它们的 similarity 和 margin。",
      "可以先用 if similarity < 0.75: return True 试试，再补上 margin 很小的情况。",
      "确认次数只有 4 次。优先留给分数最低、又确实记错的单。",
    ],
  },
  {
    index: 3,
    id: "fix-queue",
    title: "修排队",
    task: "这一关的小票都已经录对了。厨房一次只能做一道菜。加急单最多等 9 拍，普通单最多等 18 拍，超过就会超时。你要写 priority(urgent, wait, cook)：每张在等的单都会调用它，返回的数越大越先做；一样大时先来先做。先用页面上的两个预设看看「按到店顺序做」和「有加急就先做」各会漏掉哪些单，再设计自己的规则。",
    judgeNote:
      "判题程序会拿 12 个排队瞬间检查你的函数：每个瞬间给出几张在等的单，看你的函数会不会先做最等不起的那张。答对 11 张过关，12 张全对加星。",
    takeaway:
      "只按到店顺序排，加急单会等到超时；只照顾加急单，普通单又会被一直插队。排单规则要同时看这两条等待线。",
    hints: [
      "先把「按到店顺序做」和「有加急就先做」都跑一遍，记住它们各自漏了哪张单。",
      "加急单和普通单的等待上限不同。算一算每张单离超时还剩几拍，谁剩得少谁更急。",
      "如果想让两张单一样急时仍按先来后到，就让它们拿到相同的分数，不要给后到的单额外加分。",
    ],
  },
  {
    index: 4,
    id: "dinner-rush",
    title: "晚餐高峰",
    task: "晚餐高峰来了 12 张陌生订单。接单台还是那台 AI，你的 need_confirm 会直接沿用；排队也还是你写的 priority。顾客说加急的方式更多了，AI 可能把「想快一点」听成付费加急，也可能猜错「照旧」的辣度。确认过的单一定记对，但接单台会停 1 拍；没确认的单按 AI 的小票进厨房。12 张全对、确认不超过 4 次，并且至少 11 张既记对又准时，才算过关。",
    judgeNote:
      "判题程序会用你的 need_confirm 处理 12 张正式订单，再把你写的 priority 放进厨房和出餐台重放整轮。12 张全对、确认不超过 4 次、记对且准时至少 11 张，三条都满足才过关。",
    takeaway:
      "确认能让小票更准，但每确认一次，接单台就慢一拍。准确率、等待时间和出餐速度要一起算。",
    hints: [
      "先让 AI 跑一遍，看看哪些单的 similarity 或 margin 最低，再决定确认谁。",
      "确认停 1 拍可能让本来准时的单超时。先看回放里哪一桌被拖慢了。",
      "如果只差一张准时，可以回到第三关调整 priority，让等得久的单更早进厨房。",
    ],
  },
  {
    index: 5,
    id: "compensate",
    title: "附加挑战",
    task: "晚高峰的 20 张单已经按先来先做跑完了，其中 11 张送晚了或没送到。现在只能补偿，不能重排。你要写 compensate(urgent, overtime, delivered, price)，给每张问题单选一档补偿：0 不补偿，1 送小食（2 元），2 退款（送到的退一半，没送到的全退）。可以先在试算台手动改几张典型单，看看花费和预计差评怎么变，再把规则写成函数。预计差评不超过 4.0 单、补偿花费不超过 70 元，才算过关。",
    judgeNote:
      "判题程序会用同一轮先来先做的结果找到这 11 张问题单，再按你的函数逐张计算差评率和花费。预计差评和总花费都在线内才过关。",
    takeaway:
      "补偿能降低差评，但每一次补偿都要花钱。退款退的是这道菜自己的价格，所以贵菜和便宜菜不能按同一档处理。",
    hints: [
      "先看「没送到」和「送到了但超时」的差评率差多少，再看退款要花多少钱。",
      "可以先用 if not delivered and price <= 12: return 2 试试，再处理送到的单。",
      "送到后超时的单退款只退一半。算一算每花 1 元能降多少差评，再决定退哪几张。",
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
