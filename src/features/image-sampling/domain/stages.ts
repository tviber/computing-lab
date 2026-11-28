/**
 * Stage contracts for the image-sampling lab.
 *
 * The shared frame is a low-bandwidth channel: the sender shrinks each
 * signal card to a w×h grid; the receiver holds the same atlas and must
 * tell which member arrived. Every stage fixes a category, an axis mode
 * (square vs free width/height), an accuracy requirement, and a hard cell
 * budget. A submission passes iff:
 *
 *   accuracy >= requiredAccuracy  AND  width * height <= cellBudget
 *
 * Both numbers are public and shown in the UI; only the hidden gallery seeds
 * (server-side) are private. Thresholds were picked from the calibration
 * curves in scripts/calibrate-sampling.ts so each stage has a reachable
 * knee — not a single magic answer.
 */

import type { Resolution } from "./downsample.ts";
import type { CategoryId } from "./sprites.ts";

/**
 * Axis constraint per stage:
 *  - "square": width must equal height — the core "how many cells" lesson.
 *  - "free":   width and height independent — direction matters.
 *  - "tall":   like free, plus height > width is required — the anisotropy
 *              lesson made explicit after stage 4 shows the x-axis case.
 */
export type AxisMode = "square" | "free" | "tall";

export type SamplingStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  category: CategoryId;
  mode: AxisMode;
  /** Fraction of the gallery that must stay uniquely identifiable (0–1). */
  requiredAccuracy: number;
  /** Hard cap on width*height; over budget fails regardless of accuracy. */
  cellBudget: number;
  /** Stage 1 shows the guided cell_value coding exercise. */
  guided: boolean;
  /** Stage 2 must get its resolution from the student's choose_size code. */
  requiresChooseSize: boolean;
  /** One-line transmission brief: what is sent and what the receiver must recognize. */
  mission: string;
  description: string;
  hint: string;
  /** One-line concept recap shown when the stage passes. */
  takeaway: string;
  /** Resolutions listed as probes in the sweep view. */
  probes: Resolution[];
};

const squareProbes = (sizes: number[]): Resolution[] => sizes.map((n) => ({ width: n, height: n }));

export const IMAGE_SAMPLING_STAGES: SamplingStageDef[] = [
  {
    index: 1,
    id: "first-samples",
    title: "多少个格子才够",
    englishTitle: "How Many Cells",
    category: "invader",
    mode: "square",
    requiredAccuracy: 1,
    cellBudget: 256,
    guided: true,
    requiresChooseSize: false,
    mission:
      "把这组异星徽章一张张发到低带宽接收端。统一选一个 $n\\times n$。对方拿着同一份图谱，只凭收到的格子图认出每一枚是哪一张。",
    description:
      "这组徽章长得几乎一样，差别只在轮廓凸起和缺口上。$n$ 小了，两枚会糊成同一张格子图；$n$ 大了，带宽白白浪费。先随手试一个，看哪几张最先撞脸。",
    hint: "点表里的 4×4，再试 8×8。找一对撞脸的徽章，看看它们原来差在哪一块。",
    takeaway:
      "每个采样格代表原图的一块区域。图形像素占一半或更多就发 1，否则发 0。两块原本不同的图案可能因此发出相同的信号。",
    probes: squareProbes([4, 6, 8, 10, 12, 14, 16, 20, 24, 32]),
  },
  {
    index: 2,
    id: "robot-gallery",
    title: "机器人的细微差别",
    englishTitle: "Robot Gallery",
    category: "robot",
    mode: "square",
    requiredAccuracy: 1,
    cellBudget: 784,
    guided: false,
    requiresChooseSize: true,
    mission:
      "把这组机器人铭牌发到接收端。它们只在触角、眼睛、嘴和腿上有细小差别。写一个 choose_size(images)，让它算出一个 $n\\times n$，使对方仍能分清每台。",
    description:
      "你的函数会拿到整组机器人图。差别越小，需要的格子越密；差异藏在哪里、有多大，决定了 $n$ 的下限。先找出哪一对机器人最难区分，再让程序算出足够的分辨率。",
    hint: "留意眼睛间距和头顶小球的尺寸，这些局部特征最先消失。把判断写进 choose_size(images)，不要手动填一个 $n$。",
    takeaway:
      "需要的分辨率取决于图库里最细小的差异特征：差异越小，格子就要越密才能保住它。没有脱离任务的“正确分辨率”。",
    probes: squareProbes([8, 12, 16, 20, 22, 24, 26, 28, 32]),
  },
  {
    index: 3,
    id: "sigil-plates",
    title: "打孔印记",
    englishTitle: "Punched Plates",
    category: "sigil",
    mode: "square",
    requiredAccuracy: 1,
    cellBudget: 800,
    guided: false,
    requiresChooseSize: false,
    mission:
      "把这组打孔印记牌发到接收端。牌面只在打孔位置和缺口上有区别。孔洞是最容易被格子抹平的特征。",
    description:
      "孔洞只有半个格子大小时就会被多数覆盖“磨平”。先找出哪些孔在哪个 $n$ 下先消失，再决定格子数。",
    hint: "数一数孔洞占几个格子。差异区域的面积决定了它需要多密的采样。",
    takeaway:
      "孔洞、缺口这类“空的部分”也是信息：它们和凸起一样会被多数覆盖磨平。信息丢失不区分特征的形状。",
    probes: squareProbes([8, 12, 16, 20, 22, 24, 26, 28, 32]),
  },
  {
    index: 4,
    id: "wide-ridges",
    title: "宽与高分开选",
    englishTitle: "Wide Ridges",
    category: "ridge",
    mode: "free",
    requiredAccuracy: 1,
    cellBudget: 240,
    guided: false,
    requiresChooseSize: false,
    mission:
      "把这组山脊标志发到接收端。差异全部在水平方向：凸起的左右位置。现在宽和高可以分开选。同样的格子总数，方向分配不同，接收效果也不同。",
    description:
      "差异在哪个方向，采样密度就应花在哪个方向。比较 $16\\times8$ 和 $8\\times16$ 的接收效果。",
    hint: "比较一下 $16\\times8$ 和 $8\\times16$：格子数一样，但只有一个方向采得够密。",
    takeaway: "格子总数相同，保留的信息却可能不同。差异集中在哪个方向，就把更多采样放到哪个方向。",
    probes: [
      { width: 16, height: 8 },
      { width: 8, height: 16 },
      { width: 16, height: 16 },
      { width: 24, height: 8 },
      { width: 8, height: 24 },
      { width: 20, height: 8 },
      { width: 8, height: 20 },
      { width: 12, height: 16 },
      { width: 16, height: 12 },
      { width: 12, height: 12 },
      { width: 20, height: 12 },
      { width: 12, height: 20 },
    ],
  },
  {
    index: 5,
    id: "tall-pillars",
    title: "换个方向试试",
    englishTitle: "Tall Pillars",
    category: "pillar",
    mode: "tall",
    requiredAccuracy: 1,
    cellBudget: 240,
    guided: false,
    requiresChooseSize: false,
    mission:
      "把这组立柱标记发到接收端。差异全部在垂直方向：成对细缝的上下位置。本关要求 $\\text{高}>\\text{宽}$，把采样密度花在对的方向上。",
    description:
      "细缝成对出现，行数太少时两条缝会糊成一团。先把高度推到能分开它们，再在预算内压宽度。",
    hint: "先把高度推到能分开成对的细缝，再压宽度。",
    takeaway:
      "采样密度可以按方向分配。这一关差异在垂直方向，所以行数比列数更关键，宽和高也应分别调整。",
    probes: [
      { width: 10, height: 16 },
      { width: 8, height: 16 },
      { width: 12, height: 20 },
      { width: 8, height: 20 },
      { width: 10, height: 20 },
      { width: 8, height: 24 },
      { width: 10, height: 24 },
      { width: 12, height: 16 },
    ],
  },
];

export function getSamplingStage(index: number): SamplingStageDef | undefined {
  return IMAGE_SAMPLING_STAGES.find((s) => s.index === index);
}

/** Stages unlock in order: stage 1 is open, each later stage needs the previous pass. */
export function samplingStageUnlocked(passedStages: readonly number[], index: number): boolean {
  const stage = getSamplingStage(index);
  if (!stage) return false;
  return index === 1 || passedStages.includes(index - 1);
}

/** Next stage to work on: first unpassed index, capped past the last stage. */
export function nextSamplingStage(passedStages: readonly number[]): number {
  for (const stage of IMAGE_SAMPLING_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return IMAGE_SAMPLING_STAGES.length;
}
