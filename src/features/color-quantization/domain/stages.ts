/**
 * Stage contracts for the color-quantization lab.
 *
 * The shared frame is the same low-bandwidth channel as the sampling lab:
 * the sender prints each card through a printer that holds only a few
 * toner cartridges; the rack has eight. The receiver holds the same atlas
 * and must tell which member arrived. A submission is judged by printing
 * the whole gallery (public + hidden members) through the student's choice
 * and checking that every print stays unique. Two modes:
 *
 *   "pick": choose which toners to load (<= tonerSlots). The printer maps
 *           each source color to its nearest loaded toner — fixed rule.
 *   "free": the loadout is fixed; submit a mapping table that may differ
 *           from the printer's default nearest-toner table in at most
 *           overrideBudget entries.
 *
 * Both budgets are hard caps shown in the UI; only the hidden gallery seeds
 * are private. Thresholds come from scripts/calibrate-quantization.ts.
 */

import type { CategoryId } from "./sprites.ts";

export type QuantMode = "pick" | "free";

export type QuantStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  category: CategoryId;
  mode: QuantMode;
  /** Fraction of the gallery that must stay uniquely identifiable (0–1). */
  requiredAccuracy: number;
  /** pick mode: max number of toner cartridges that may be loaded. */
  tonerSlots: number | null;
  /** free mode: the fixed set of loaded toner indices. */
  fixedLoadout: number[] | null;
  /** free mode: max entries differing from the default nearest-toner table. */
  overrideBudget: number | null;
  /** Stage 1 shows the guided nearest_toner coding exercise. */
  guided: boolean;
  /** One-line transmission brief: what is sent and what the receiver must recognize. */
  mission: string;
  description: string;
  hint: string;
  /** One-line concept recap shown when the stage passes. */
  takeaway: string;
  /**
   * pick mode: one-click loadouts in the explorer — pedagogically chosen to
   * surface failure modes (naive picks, trap toners), never the answer.
   */
  probes: { label: string; toners: number[] }[];
};

export const COLOR_QUANT_STAGES: QuantStageDef[] = [
  {
    index: 1,
    id: "first-print",
    title: "一种颜色去哪",
    englishTitle: "Where a Color Goes",
    category: "cadet",
    mode: "pick",
    requiredAccuracy: 1,
    tonerSlots: 8,
    fixedLoadout: null,
    overrideBudget: null,
    guided: true,
    mission:
      "把这批学员机器人的原稿印出来发给接收端。对方拿着同一份图谱，只凭印出的图认出每台是哪一台。",
    description:
      "这台墨粉打印机有 8 个粉槽，粉架上正好 8 种粉。先随手装几种粉看看：每种源色会落到离它最近的已装粉（或纸白）上。两个源色落进同一只粉，印出来就再也分不开。",
    hint: "先在实验台里抽掉几种粉看哪个部件的颜色先被合并，下方练习再让你亲手写下“最近色”这条规则。",
    takeaway:
      "量化把许多颜色压进少数几个槽位：每种源色落到最近的墨粉。两个不同的源色如果落到同一种粉，打印出来就再也分不开。",
    probes: [{ label: "装满 8 种粉", toners: [0, 1, 2, 3, 4, 5, 6, 7] }],
  },
  {
    index: 2,
    id: "four-slots",
    title: "只有四个粉槽",
    englishTitle: "Four Slots",
    category: "patrol",
    mode: "pick",
    requiredAccuracy: 1,
    tonerSlots: 4,
    fixedLoadout: null,
    overrideBudget: null,
    guided: false,
    mission: "巡逻小队的铭牌只能靠 4 个粉槽印出去。装哪 4 种，决定接收端还能不能分清每台机器人。",
    description: "直觉的“红黄蓝黑”并不好用：看看每个部件上实际出现过哪些颜色、哪些颜色对必须分开。",
    hint: "先找哪一对成员最难分开。把它们分开所需要的颜色，就是必须装的粉。",
    takeaway: "选哪些粉等于选保住哪些差异：槽位不够时，要拆开的颜色对决定了必须装的粉。",
    probes: [
      { label: "三原色+黑", toners: [0, 1, 3, 6] },
      { label: "印刷四色", toners: [0, 3, 5, 7] },
      { label: "暖色系", toners: [0, 1, 2, 3] },
    ],
  },
  {
    index: 3,
    id: "cant-fit-all",
    title: "装不下所有粉",
    englishTitle: "Cannot Fit Them All",
    category: "cargo",
    mode: "pick",
    requiredAccuracy: 0.75,
    tonerSlots: 4,
    fixedLoadout: null,
    overrideBudget: null,
    guided: false,
    mission:
      "货运机器人的配色散在整个色环上，4 个粉槽保不住全部差异。选清楚牺牲哪几对，让至少 3/4 的成员印出去后仍能被认出。",
    description:
      "这批货运机器人的配色分散在色环上，4 个粉槽装不下全部差异。本关只要求至少 3/4 的成员印出后仍能被认出。",
    hint: "找出哪一对成员的区分最“贵”（需要两种冷门粉同时在线），考虑放弃它去保全其余。",
    takeaway: "槽位不够时，需要先决定放弃哪几对成员，再把有限的粉留给能保住最多成员的那些差异。",
    probes: [
      { label: "三原色+黑", toners: [0, 1, 3, 6] },
      { label: "暖色系", toners: [0, 1, 2, 3] },
      { label: "印刷四色", toners: [0, 3, 5, 7] },
    ],
  },
  {
    index: 4,
    id: "magenta-trap",
    title: "多装一种反而更糟",
    englishTitle: "The Magenta Trap",
    category: "recon",
    mode: "pick",
    requiredAccuracy: 1,
    tonerSlots: 4,
    fixedLoadout: null,
    overrideBudget: null,
    guided: false,
    mission: "侦察机器人的耳部配色只有紫罗兰和酒红两种。选 4 支粉印出整组图，让每一台仍能被认出。",
    description:
      "粉架上有一支洋红，看起来离这两种耳朵都很近。先按直觉装一组粉，再检查紫罗兰和酒红是否还能分开。",
    hint: "分别比较紫罗兰和酒红到各支已装粉的距离。加粉会改变每种源色的最近色归属，所以多装一支不一定更好。",
    takeaway:
      "多加一支粉不总会改善结果：新粉可能把原本被迫分开的颜色重新合并。量化看的是最终能否区分，颜色是否更接近只是规则带来的结果。",
    probes: [
      { label: "装上洋红", toners: [0, 1, 6, 7] },
      { label: "洋红+冷色", toners: [3, 5, 6, 7] },
      { label: "洋红+暖色", toners: [1, 2, 4, 7] },
    ],
  },
  {
    index: 5,
    id: "beyond-nearest",
    title: "超越最近色",
    englishTitle: "Beyond Nearest",
    category: "cargo",
    mode: "free",
    requiredAccuracy: 1,
    tonerSlots: null,
    fixedLoadout: [1, 2, 4, 6],
    overrideBudget: 4,
    guided: false,
    mission:
      "还是货运机器人，但这台打印机的粉盒焊死了：红、橙、绿、蓝。默认映射只有三成能认出。你可以改写映射表，但最多改 4 条，让每张图接收端都能认出。",
    description:
      "先用默认映射跑一遍，看实验台列出哪几对机器人印成一样。每一对都对应某个被吃掉的色彩差异。",
    hint: "把其中一方的源色“发配”到一个空闲的粉（哪怕它不最近），能不能拆开这对？一条改动可能同时拆开好几对。目标是用最少的改动换最多的区分。",
    takeaway:
      "最近色只是默认规则。任务要求每一台都能被认出时，可以把某些源色改投到更远的粉，用少量改动拆开原本冲突的颜色对。",
    probes: [],
  },
];

export function getQuantStage(index: number): QuantStageDef | undefined {
  return COLOR_QUANT_STAGES.find((s) => s.index === index);
}

/** Stages unlock in order: stage 1 is open, each later stage needs the previous pass. */
export function quantStageUnlocked(passedStages: readonly number[], index: number): boolean {
  const stage = getQuantStage(index);
  if (!stage) return false;
  return index === 1 || passedStages.includes(index - 1);
}

/** Next stage to work on: first unpassed index, capped past the last stage. */
export function nextQuantStage(passedStages: readonly number[]): number {
  for (const stage of COLOR_QUANT_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return COLOR_QUANT_STAGES.length;
}
