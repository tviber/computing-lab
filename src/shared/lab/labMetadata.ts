/**
 * Canonical lab catalog manifest: the single declaration of every lab id,
 * public title, home-card blurb, entry route, category, and optional default
 * visibility. Pure presentation/catalog data (no React or feature imports),
 * shared by both frontend registries and server visibility/route registries.
 *
 * Adding a new lab starts here — TypeScript enforces every downstream
 * registry (`APP_LABS`, `LAB_SPECS`, `LAB_ROUTES`, and router entries) covers
 * every `LabId`.
 *
 * Entry order is the display order on the homepage, admin/teacher lab lists,
 * and class dashboard picker.
 */
export type LabCategory = "computer-architecture" | "data-encoding" | "information-systems";

export type LabMetadataEntry = {
  title: string;
  description: string;
  entryPath: `/labs/${string}`;
  category: LabCategory;
  /** Labs awaiting review stay closed until an administrator opens them. */
  defaultHidden?: boolean;
};

export const labMetadata = {
  calculator: {
    title: "实现ALU",
    description: "从半加器到完整计算器：用逻辑门逐关搭出运算电路。",
    entryPath: "/labs/calculator",
    category: "computer-architecture",
  },
  decoding: {
    title: "解码侦探",
    description:
      "同一串数字是什么，全看约定的解码规则：从字码到二进制位，再到读懂一张 BMP 图片的文件头。",
    entryPath: "/labs/decoding",
    category: "data-encoding",
  },
  "lunch-shift": {
    title: "设计餐馆系统",
    description:
      "送对一张订单，教 AI 听懂顾客的各种说法、写函数排出先做哪张——12 张订单全对全准时才算真本事。",
    entryPath: "/labs/lunch-shift",
    category: "information-systems",
  },
  "ml-intro": {
    title: "机器学习入门",
    description:
      "从 10 个词的直觉策略打分起步，再一路走进切词向量、S 曲线概率与梯度下降，用真实语料看懂分类器是怎么炼成的。",
    entryPath: "/labs/ml-intro",
    category: "information-systems",
  },
  "image-sampling": {
    title: "空间采样",
    description: "把信号图压成格子发到低带宽接收端：格子数越少越省，但差异特征会先被抹平。",
    entryPath: "/labs/image-sampling",
    category: "data-encoding",
  },
  "color-quantization": {
    title: "颜色量化",
    description: "只用几种墨粉把原稿印给接收端：两个源色落进同一只粉，那部分差异就丢了。",
    entryPath: "/labs/color-quantization",
    category: "data-encoding",
  },
} as const satisfies Record<string, LabMetadataEntry>;

export type LabId = keyof typeof labMetadata;

export const LAB_IDS = Object.keys(labMetadata) as LabId[];
