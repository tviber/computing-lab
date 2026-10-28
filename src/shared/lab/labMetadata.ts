/**
 * Lab display metadata: the single declaration of each lab's public title,
 * home-card blurb, entry route, and grouping. Pure presentation data —
 * server visibility (`server/labs.ts` LAB_REGISTRY) and the explicit
 * `src/app/router.tsx` entries stay separate, so registering a new lab
 * still means adding it there; this manifest only removes the duplicated
 * title/description lists.
 *
 * Entry order is the home-page card order.
 */
export const labMetadata = {
  calculator: {
    title: "实现ALU",
    description: "从半加器到完整计算器：用逻辑门逐关搭出运算电路。",
    entryPath: "/labs/calculator",
    category: "computer-architecture",
  },
  cpu: {
    title: "冯诺依曼数据通路",
    description:
      "一台点餐机就是冯·诺依曼：拨码开关进、数码管出，按一下时钟走一拍——看五大部件怎么取指、译码、执行。",
    entryPath: "/labs/cpu",
    category: "computer-architecture",
  },
  decoding: {
    title: "解码侦探",
    description:
      "同一串数字是什么，全看约定的解码规则：从字码到二进制位，再到读懂一张 BMP 图片的文件头。",
    entryPath: "/labs/decoding",
    category: "data-encoding",
  },
  "is-sim": {
    title: "小型信息系统",
    description: "搭一个传感器、网关、数据库、执行器组成的小系统：在事件的时间线上看数据怎么流动。",
    entryPath: "/labs/is-sim",
    category: "information-systems",
  },
  "lunch-shift": {
    title: "午市救援",
    description:
      "先亲手送对一张订单，再给餐馆定下接单、厨房、出餐的处理规则——看系统按规则处理 12 张订单能拿多少分。",
    entryPath: "/labs/lunch-shift",
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
  "audio-encoding": {
    title: "声音编码（演示）",
    description: "把声波变成数字：调采样率看混叠折回频谱，调位深看量化阶梯——全程在浏览器本地演示。",
    entryPath: "/labs/audio-encoding",
    category: "data-encoding",
  },
} as const;

export type LabId = keyof typeof labMetadata;

export type LabCategory = (typeof labMetadata)[LabId]["category"];
