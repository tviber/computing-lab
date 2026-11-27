export type StatsConceptOption = {
  label: string;
  note?: string;
};

export type StatsConceptQuestion = {
  id: string;
  prompt: string;
  options: StatsConceptOption[];
  correct: number;
  reveal: string;
};

export type StatsFoundationsStageDef = {
  index: number;
  slug: "linear-regression" | "conditional-prob" | "likelihood" | "sigmoid-bridge";
  title: string;
  englishTitle: string;
  description: string;
  task: string;
  judgeNote: string;
  takeaway: string;
  hints: string[];
  question?: StatsConceptQuestion;
};

export const STATS_FOUNDATIONS_STAGES: readonly StatsFoundationsStageDef[] = [
  {
    index: 1,
    slug: "linear-regression",
    title: "线性回归：奶茶店的温度生意",
    englishTitle: "Linear Regression",
    description:
      "校园奶茶店记录了过去 10 天的气温和冰奶茶销量。试着拖动斜率 w 和截距 b，让直线贴合这些点，并用「残差方块」直观感受最小二乘法。",
    task: "调整斜率 w 与截距 b，让均方误差（MSE）降到 16 或以下，并完成下方的直觉小问答。",
    judgeNote: "检查 MSE ≤ 16，且直觉问答选择正确。",
    takeaway:
      "线性回归用 y = wx + b 拟合数值趋势，通过最小化残差平方的平均值（MSE）找到最稳的直线。逻辑回归的第一步也是先算一条直线 z = wx + b。",
    hints: [
      "气温每升高 1°C，冰奶茶大概多卖 3 杯左右，所以斜率 w 可以在 3 附近微调。",
      "开启「显示残差方块」后，目标是把所有红色正方形的总面积压到最小。",
    ],
    question: {
      id: "why-square",
      prompt:
        "衡量一条直线拟合得好不好，为什么通常要把每个点的误差（残差）先「平方」再相加，而不是直接把残差相加？",
      options: [
        {
          label: "因为正误差和负误差直接相加会互相抵消，看起来好像「总误差为 0」",
        },
        {
          label: "因为计算机只能算乘法，不能算减法",
          note: "乘法与减法都可以计算。问题出在残差直接相加时会正负抵消。",
        },
        {
          label: "因为平方之后数值变小，画图更方便",
          note: "平方通常会让误差变大。这样做的目的是消除符号并加重惩罚大误差。",
        },
      ],
      correct: 0,
      reveal:
        "残差有正有负。如果一个点在直线上方 +10，另一个点在直线下方 -10，直接相加会得到 0，看起来像完美拟合。平方后所有误差都变成非负数，大误差也会受到更重的惩罚。",
    },
  },
  {
    index: 2,
    slug: "conditional-prob",
    title: "条件概率：校园气象台靠谱吗",
    englishTitle: "Conditional Probability",
    description:
      "气象台统计了 100 天的预报与实际天气。点击上方筛选按钮，把视野缩小到特定子集，看看「已知预报下雨，真下雨的概率」和「已知真下雨，预报对的概率」为什么不一样。",
    task: "利用 100 天方阵，算出 3 个概率百分比（误差不超过 1 个百分点），并回答条件概率小问答。",
    judgeNote: "检查 3 个概率数值正确，且小问答选择正确。",
    takeaway:
      "条件概率 P(A|B) 就是「把分母缩小到 B 发生的那部分世界，再数 A 占了多少」。逻辑回归输出的正是条件概率 P(垃圾短信 | 短信内容)。",
    hints: [
      "点击「只看预报下雨」按钮，数一数亮着的格子一共多少天（分母），其中「预报准了真下雨」的占多少天（分子）。",
      "注意区分：P(真下雨 | 预报下雨) 的分母是「预报下雨的 40 天」，而 P(预报下雨 | 真下雨) 的分母是「实际下雨的 30 天」。",
    ],
    question: {
      id: "cond-order",
      prompt:
        "在校园气象台的这 100 天里，为什么 P(真下雨 | 预报下雨) = 60%，而 P(预报下雨 | 真下雨) = 80%？",
      options: [
        {
          label: "因为两个概率的分子不同",
          note: "两个概率的分子都是「既预报下雨又真下雨」的 24 天。",
        },
        { label: "因为已知条件不同，作为分母的样本范围不一样（40 天 vs 30 天）" },
        {
          label: "因为气象台把数据算错了，这两个概率应该永远相等",
          note: "两个条件概率问的是不同问题，分母不同，数值本来就不必相等。",
        },
      ],
      correct: 1,
      reveal:
        "分子都是「既预报下雨又真下雨」的 24 天。条件改变后，作为分母的样本范围也改变，所以 P(A|B) 与 P(B|A) 是两个不同的概率。",
    },
  },
  {
    index: 3,
    slug: "likelihood",
    title: "最大似然：估计硬币的正面概率",
    englishTitle: "Maximum Likelihood",
    description:
      "游园会摊位的一枚硬币抛了 10 次，出现 7 次正面、3 次反面。如果我们猜测正面朝上的概率是 p，那么按图中的顺序观察到这串结果的概率是多少？哪个 p 能让它最大？",
    task: "拖动滑块找到让似然 L(p) 达到最大（同时负对数似然最小）的正面概率 p，并完成小问答。",
    judgeNote: "检查猜测的 p 落在最大似然最优值 0.70 附近（0.67 ~ 0.73），且小问答正确。",
    takeaway:
      "最大似然估计（MLE）选择一个参数，使已经观察到的数据出现的概率最大。取负对数后，最大化似然就变成最小化对数损失，这也是逻辑回归使用的目标函数。",
    hints: [
      "观察似然曲线的最高点（峰顶）落在横轴 p 的什么位置。",
      "切换到「负对数似然 -ln L(p)」视图，观察最低点（谷底）是否落在同一个 p 处。",
    ],
    question: {
      id: "why-nll",
      prompt:
        "切换视图后你会发现：让似然 L(p) 最大，和让负对数似然 -ln L(p) 最小，找到的最佳 p 完全一样。这样做的好处是什么？",
      options: [
        {
          label: "取对数能把一长串小数相乘变成加法，避免数字小到算不出，且方向与「最小化损失」一致",
        },
        {
          label: "因为取对数之后，所有概率都会变成大于 1 的整数",
          note: "概率本身仍在 0 到 1 之间。取对数改变的是计算方式，不会让概率变成整数。",
        },
        {
          label: "因为不取对数就画不出曲线",
          note: "似然曲线可以直接画。取对数主要是为了数值稳定，并让最大化与最小化损失统一。",
        },
      ],
      correct: 0,
      reveal:
        "样本很多时，大量小数连乘会下溢成 0。取负对数后，连乘变成连加，最大化似然也变成最小化损失，这就是交叉熵损失的来源。",
    },
  },
  {
    index: 4,
    slug: "sigmoid-bridge",
    title: "从直线到概率：通往逻辑回归",
    englishTitle: "From Line to Probability",
    description:
      "下面把前几关的思路合在一起：根据考前复习小时数预测能否通过测验（0 或 1）。先观察直线在概率上哪里说不通，再用 S 形曲线（Sigmoid）配合最大似然，调出一个可用的分类器。",
    task: "切换到 Sigmoid 曲线模式，调整斜率 w 和偏移 b，使分类准确率 ≥ 90% 且平均对数损失 ≤ 0.35。",
    judgeNote: "检查准确率 ≥ 90% 且平均对数损失 ≤ 0.35。",
    takeaway:
      "你完成了一次手动逻辑回归：用直线打分 z = wx + b，用 Sigmoid 把分数变成条件概率 P(y=1|x)，再用负对数似然衡量拟合好坏。下一课会让计算机自动学习这些参数。",
    hints: [
      "观察散点：复习 4 小时及以下大多未通过（0），4.8 小时及以上都通过了（1）。分界点可以先放在 4.4 小时附近。",
      "分界点公式是 x₀ = -b / w。先让分界点落在 4.4 小时附近，再选一个合适的斜率 w，使曲线在分界点附近足够陡，最后用公式反推 b。",
    ],
  },
];

export function getStatsFoundationsStage(index: number): StatsFoundationsStageDef | undefined {
  return STATS_FOUNDATIONS_STAGES.find((s) => s.index === index);
}

export function nextStatsFoundationsStage(index: number): number | null {
  const next = STATS_FOUNDATIONS_STAGES.find((s) => s.index === index + 1);
  return next ? next.index : null;
}

export function statsFoundationsStageUnlocked(
  stageIndex: number,
  passedStages: readonly number[],
): boolean {
  if (stageIndex <= 1) return true;
  return passedStages.includes(stageIndex - 1);
}
