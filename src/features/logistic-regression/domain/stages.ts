import type { CalibrationMessage } from "./logisticRegression.ts";
import { tokenizeWords, type RawTokenStatus } from "./tokenizer.ts";

export type ConceptOption = {
  label: string;
  note?: string;
};

export type ConceptPrompt = {
  id: string;
  prompt: string;
  options: ConceptOption[];
  correct: number;
  reveal: string;
};

export type TokenizePreset = {
  id: string;
  label: string;
  tag: string;
  text: string;
  note: string;
};

export const TOKENIZE_PRESETS: TokenizePreset[] = [
  {
    id: "promo",
    label: "促销广告",
    tag: "垃圾短信示例",
    text: "【特惠】免费领取现金红包！！点击链接立即兑换，回复TD退订",
    note: "程序会保留词表中的词，忽略感叹号和方括号。模型将在后续训练中学习哪些词与垃圾短信相关。",
  },
  {
    id: "ham-normal",
    label: "日常沟通",
    tag: "正常短信",
    text: "明天下午和同学一起去学校看电影，别忘了带手机！",
    note: "这是一条正常消息。看看哪些词被记为 1，再与广告短信比较。",
  },
  {
    id: "ham-trap",
    label: "正常消息里也有广告常用词",
    tag: "正常短信示例",
    text: "同学有一张优惠名额，明天一起去领取吧~",
    note: "这条正常消息也有「优惠」「领取」。模型能否分对，还要看「同学」「明天」「一起」等词的权重。",
  },
  {
    id: "oov-scam",
    label: "有些词不在词表里",
    tag: "看看哪些词没被记录",
    text: "元宇宙盲盒空投到账，速领限时空投奖励！",
    note: "「元宇宙」「盲盒」「空投」不在训练词表里。模型不计算这些词，只计算词表里已有的词。",
  },
];

export type TokenPuzzleItem = {
  id: string;
  text: string;
  displayNote: string;
  expected: RawTokenStatus;
};

export const TOKENIZE_PUZZLE_SENTENCE = "免费领取免费红包！元宇宙限时";

export const TOKENIZE_PUZZLE_ITEMS: TokenPuzzleItem[] = [
  { id: "tok-0", text: "免费", displayNote: "第 1 个词（训练词表内）", expected: "kept" },
  { id: "tok-1", text: "领取", displayNote: "第 2 个词（训练词表内）", expected: "kept" },
  { id: "tok-2", text: "免费", displayNote: "同句第 2 次出现", expected: "duplicate" },
  { id: "tok-3", text: "红包", displayNote: "第 4 个词（训练词表内）", expected: "kept" },
  { id: "tok-4", text: "！", displayNote: "中文感叹号", expected: "filtered" },
  { id: "tok-5", text: "元宇宙", displayNote: "训练词表里没有这个词", expected: "oov" },
  { id: "tok-6", text: "限时", displayNote: "末尾词（训练词表内）", expected: "kept" },
];

export const SCORE_WORDS = [
  "免费",
  "领取",
  "点击",
  "退订",
  "优惠",
  "同学",
  "明天",
  "一起",
] as const;

export const SCORE_CALIBRATION_SMS: CalibrationMessage[] = [
  {
    id: "spam-1",
    label: 1,
    tag: "促销",
    text: "【特惠】免费领取现金红包，回复TD退订",
    tokens: tokenizeWords("【特惠】免费领取现金红包，回复TD退订"),
  },
  {
    id: "spam-2",
    label: 1,
    tag: "诱导",
    text: "尊敬的客户，限时积分兑换请点击链接领取",
    tokens: tokenizeWords("尊敬的客户，限时积分兑换请点击链接领取"),
  },
  {
    id: "spam-3",
    label: 1,
    tag: "推广",
    text: "全场限时优惠，点击立即参与，退订回TD",
    tokens: tokenizeWords("全场限时优惠，点击立即参与，退订回TD"),
  },
  {
    id: "ham-1",
    label: 0,
    tag: "带有广告常用词的正常短信",
    text: "同学有一张优惠名额，明天一起去领取吧",
    tokens: tokenizeWords("同学有一张优惠名额，明天一起去领取吧"),
  },
  {
    id: "ham-2",
    label: 0,
    tag: "日常",
    text: "明天下午和同学一起去老师办公室",
    tokens: tokenizeWords("明天下午和同学一起去老师办公室"),
  },
  {
    id: "ham-3",
    label: 0,
    tag: "含「免费」的正常短信",
    text: "同学说学校明天可以免费看电影，一起去吗",
    tokens: tokenizeWords("同学说学校明天可以免费看电影，一起去吗"),
  },
];

export const TRAIN_MAX_TRAIN_LOSS = 0.08;
export const TRAIN_MAX_VAL_LOSS = 0.12;

export type LogisticRegressionStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  description: string;
  task: string;
  judgeNote: string;
  takeaway: string;
  hints: string[];
  prompts: ConceptPrompt[];
  optional?: boolean;
};

export const LOGISTIC_REGRESSION_STAGES: LogisticRegressionStageDef[] = [
  {
    index: 1,
    id: "strategy",
    title: "给 10 个词打分",
    englishTitle: "Strategy Game",
    description:
      "给每个词设一个分值。程序把短信中出现的词的分值相加，总分达到 +1 就拦截，否则放行。",
    task: "至少给 2 个词设正分、2 个词设负分。调到 6 条短信都分对后，回答概念题。",
    judgeNote:
      "服务器按 $w\\cdot x\\ge +1$ 的规则检查这 6 条短信，并核对正负分词的数量和概念题。全部符合要求后，你可以进入第 2 关。",
    takeaway:
      "你刚才给词设置的分值就是权重 w。短信中的词出现记 1，不出现记 0，这组数字就是 x。点积 $w\\cdot x$ 把出现过的词的权重相加，得到一个分数；第 3 关会介绍怎样把分数转换为模型估计的概率。",
    hints: [
      "你可以先试着给「中奖、发票、退款、优惠」加分，给「妈妈、开会、老师」减分，再检查哪些短信仍然分错了。",
      "第 6 条是正常的报销消息，但也有「发票」「退款」。你需要让「妈妈、老师、开会」的负分抵消这些正分。",
      "「今天、明天、通知」在两类短信里都可能出现。你可以先把它们设为 0，看看第 5 条短信会不会被拦截。",
    ],
    prompts: [
      {
        id: "dot-product-strategy",
        prompt: "x 记录哪些词出现了，w 记录你给每个词的分值。程序计算 $w\\cdot x$ 时，做了什么？",
        options: [
          {
            label: "只统计短信总字数并按出现先后顺序加权",
            note: "点积只按词典位置加权求和，不依赖字数与前后顺序。",
          },
          {
            label: "程序把出现过的词的权重相加，得到这条短信的总分",
          },
          {
            label: "把 10 个词权重直接连乘，只要有一个无关词为 0 总分就归零",
            note: "点积是逐项相乘再相加（$\\sum_i w_i x_i$），不是全部权重连乘。",
          },
        ],
        correct: 1,
        reveal:
          "程序逐项计算 $w_i x_i$，再相加。词没有出现时 $x_i=0$，不贡献分数；出现时 $x_i=1$，就加上它的权重。",
      },
      {
        id: "neutral-zero",
        prompt:
          "像「今天」「明天」「通知」这样在日常通知与营销短信里都常见的词，策略权重怎么设更合理？",
        options: [
          {
            label: "设为 +2，让程序拦截带有「通知」的短信",
            note: "学校和工作消息里也常有「通知」。给它加分，可能会误拦正常短信。",
          },
          {
            label: "设为 0，让其他更能区分两类短信的词参与评分",
          },
          {
            label: "设为 −2，抵消「中奖」「退款」带来的正分",
            note: "如果「通知」拿到 −2，带「中奖通知」的垃圾短信就会被错放。",
          },
        ],
        correct: 1,
        reveal: "在这组例子中，这些词不能有效区分两类短信。先把它们设为 0，可以避免它们干扰判断。",
      },
    ],
  },
  {
    index: 2,
    id: "tokenize",
    title: "从短信到数字",
    englishTitle: "Features",
    description: "程序先给短信分词，再按训练词表逐项记录：词出现记 1，没出现记 0。",
    task: "请先试着重复一个词、添加标点或交换词序，观察结果。然后判断程序会怎样处理练习句中的词和标点，并回答概念题。",
    judgeNote: "下面的 7 个选择和概念题全部答对后，你可以进入第 3 关。",
    takeaway:
      "这组 0/1 数字叫作二元词袋向量。它只记录词表中的哪些词出现过，不记录先后顺序，也不累计重复次数。不在词表中的词不会参与计算。",
    hints: [
      "词表中的词只要出现，对应位置就记 1。你再写一次这个词，数值仍然是 1；标点不会占用一个位置。",
      "「元宇宙」不在训练词表里，所以不参与计算。这样的词叫作词表外词，英文缩写是 OOV。",
      "本实验只用训练集建立词表并学习权重。验证集用来比较学习率和训练轮数；测试集留到最终评估，避免反复看测试结果来调模型。",
    ],
    prompts: [
      {
        id: "bow-order",
        prompt: "在 0/1 词袋模型里，「朋友请我免费喝奶茶」和「免费请我朋友喝奶茶」的向量会怎样？",
        options: [
          {
            label: "两个向量完全相同，因为词袋只记录出现过哪些词，不记先后顺序",
          },
          {
            label: "记录数字的位置会跟着句子中的词序一起改变",
            note: "每个词的位置由词表决定。句子里的词换了顺序，词表的位置不会变。",
          },
          {
            label: "词袋会把整句话拼成一个拼音数字串",
            note: "程序为词表里的每个词留一个位置，只用 0 或 1 记录这个词有没有出现。",
          },
        ],
        correct: 0,
        reveal:
          "这两句话包含相同的词，所以 0/1 词袋向量相同。模型只凭这组数字，无法判断词语的先后顺序。",
      },
      {
        id: "oov-effect",
        prompt: "如果短信中有一个不在训练词表里的新词，模型会怎样处理它？",
        options: [
          {
            label: "机器会自动联网查词典补出权重",
            note: "本实验的模型只使用已有词表，不会联网查词。",
          },
          {
            label: "这个词不参与计算，模型只计算词表中已有的词",
          },
          {
            label: "只要有一个词不在词表中，整条短信就会被判为垃圾短信",
            note: "不在词表中的词没有对应的分数，不会让整条短信直接变成垃圾短信。",
          },
        ],
        correct: 1,
        reveal:
          "词表中没有这个词，就没有给它留位置，也没有对应的权重。模型只计算短信中其他已知词的得分。",
      },
      {
        id: "train-only-vocab",
        prompt: "为什么词表只能从训练集生成，不能把测试集也一起收进词表？",
        options: [
          {
            label: "因为测试集文字太多内存装不下",
            note: "我们要用测试集检查模型处理新短信的能力，不能提前用它来整理词表。",
          },
          {
            label: "这样会提前使用测试数据的信息，无法客观检验模型处理新数据的能力",
          },
          {
            label: "把测试词收进词表能让所有未见词自动算出正确权重",
            note: "只把词加入词表，并不能让模型学到它的权重；权重需要从训练样本中学习。",
          },
        ],
        correct: 1,
        reveal:
          "词表也是从数据中得到的信息。提前用测试短信建词表，测试时就不再是第一次遇到这些用词了，这也叫数据泄露。",
      },
    ],
  },
  {
    index: 3,
    id: "score",
    title: "从分数到概率",
    englishTitle: "Linear Score",
    description:
      "逻辑回归先计算分数 $z=w\\cdot x+b$，再用 Sigmoid 函数把它转换为垃圾短信的预测概率。这里的 $b$ 叫偏置，它决定没有已知词时的起始分数。下面的模型会误拦一些正常短信，你来调整它。",
    task: "请调整偏置和 8 个词的权重，让 6 条短信全部分对。模型把概率达到 50% 的短信判为垃圾；没有已知词时的概率也需要低于 50%。完成后回答概念题。",
    judgeNote:
      "服务器会重新计算 6 条短信的预测，检查它们是否全部分对、$\\sigma(b)$ 是否低于 50%，以及概念题是否全部答对。",
    takeaway:
      "偏置和词权重一起决定分数 $z$，Sigmoid 再把 $z$ 转换为预测概率。$z=0$ 时概率是 50%，$z$ 越大概率越高。这个概率是模型的估计，不保证判断正确。下一关会让模型自己学习权重。",
    hints: [
      "起始偏置 $b=+0.4$，没有已知词时的垃圾概率约为 59.9%。你可以先把 $b$ 调成负数，例如 −1.0。",
      "你可以把「同学」「明天」「一起」的权重调到 −1.6 至 −2.0，观察含有「优惠」或「免费」的正常短信会怎样变化。",
      "请点选一条短信，再调整一个词的权重。看看它的总分 $z$ 和曲线上的概率是否一起变化。",
    ],
    prompts: [
      {
        id: "bias-meaning",
        prompt: "如果一条短信里的词都不在词表中，模型预测的垃圾概率由什么决定？",
        options: [
          {
            label: "一定输出 0，因为没有词汇得分",
            note: "词语得分是 0，但模型还会加上偏置 b，再计算 $\\sigma(b)$。",
          },
          {
            label: "由偏置 $b$ 决定，即 $p=\\sigma(b)$",
          },
          {
            label: "随机猜一个 0 到 1 之间的数",
            note: "线性模型完全确定，不存在随机输出。",
          },
        ],
        correct: 1,
        reveal:
          "短信里的词都不在词表中时，$w\\cdot x=0$，总分就等于 b。此时模型输出 $\\sigma(b)$，不一定是 0 或 50%。",
      },
      {
        id: "counter-weight",
        prompt:
          "「同学有一张优惠名额，明天一起去领取吧」是一条正常短信。给「同学」「一起」设负权重，为什么有助于把它分对？",
        options: [
          {
            label: "因为遇到日常词会直接跳过后面的词不看",
            note: "线性模型不会短路跳过，每个词都会参与求和。",
          },
          {
            label: "这些词的负权重可以抵消正权重，让总分降到 0 以下",
          },
          {
            label: "因为 Sigmoid 会自动删除正常词",
            note: "Sigmoid 只负责单调压缩总分 $z$，本身不挑词。",
          },
        ],
        correct: 1,
        reveal:
          "模型会把所有已知词的权重相加。负权重能抵消正权重；总分低于 0 时，Sigmoid 输出的垃圾概率就低于 50%。",
      },
    ],
  },
  {
    index: 4,
    id: "train",
    title: "训练模型",
    englishTitle: "Gradient Descent",
    description:
      "词表里有上千个词，逐个手调很费时间。这一关，模型从零权重开始，逐条读取有标签的短信，再按预测误差调整权重。你来设置学习率 η 和训练轮数，观察训练结果。",
    task: "调整学习率和轮数，让训练损失不高于 0.08，验证损失不高于 0.12。",
    judgeNote:
      "服务器会使用你的学习率和轮数重新训练模型。两项损失达到要求后，即可用你的模型试分新短信。",
    takeaway:
      "随机梯度下降（SGD）每读一条短信就更新一次权重。词权重的更新量是 $-\\eta(p-y)x_j$；偏置的输入恒为 1，更新量是 $-\\eta(p-y)$。这里 $p$ 是预测的垃圾概率，$y$ 是真实标签；没有出现的词因 $x_j=0$ 而保持不变。学习率决定每次改多少；改得太小，训练可能很慢，改得太大，损失可能来回波动。",
    hints: [
      "请比较 $\\eta=0.002$ 和 $\\eta=5.0$ 时的损失曲线，再试试 0.05 到 0.25 之间的值。哪一组能让训练损失和验证损失一起下降？",
      "本实验用单条短信的交叉熵损失更新权重。第 $j$ 个词的梯度是 $(p-y)x_j$，其中词出现时 $x_j=1$。用学习率乘以梯度，再取负号，就得到权重改变量。",
      "你可以从 $\\eta=0.1$、12 到 16 轮开始。拖动回放滑块，看看「TD」「退订」「免费」的权重如何从 0 开始变化。",
    ],
    prompts: [],
  },
  {
    index: 5,
    id: "experience",
    title: "用新短信试试模型",
    englishTitle: "Try your classifier",
    description: "用第 4 关训练的模型试一试。可以选一条示例，也可以自己写一条短信。",
    task: "看模型会把短信分到哪一类，再换几个词试试。",
    judgeNote: "试分任一示例后即可记录进度。自写短信只在浏览器里处理。",
    takeaway: "模型根据训练时学到的词权重分类。换一种写法，预测也可能改变。",
    hints: [],
    prompts: [],
  },
  {
    index: 6,
    id: "sgd-code",
    title: "梯度维修台",
    englishTitle: "Bonus · Write SGD",
    optional: true,
    description:
      "主线之外的引擎挑战：补上逻辑回归每读一条短信时执行的更新代码，观察自己写的模型是否学会，再用求导和权重切片复盘它为什么有效。",
    task: "先预测一次权重变化，再修好四行 SGD。用 20 轮训练和验证损失检查代码，最后沿损失切片看清梯度如何带着权重下坡。",
    judgeNote: "挑战结果按单步更新、训练与验证损失、概念检查共同评定。",
    takeaway:
      "$p-y$ 表示预测垃圾概率与真实标签的差。减去 $\\eta(p-y)x$，就是沿当前短信损失的负梯度更新；这不保证整组短信的平均损失每一步都下降。",
    hints: [
      "先用 $y=1$、$p=0.2$ 想一想：模型猜低了，出现过的词应该增重。",
      "每条短信只预测一次；没有出现的词乘 0 后不会改变。",
    ],
    prompts: [
      {
        id: "sgd-direction",
        prompt: "把 w[j] -= g * xi[j] 写成 +=，训练最可能怎样？",
        options: [
          { label: "损失反而上升，像在沿着梯度上坡" },
          { label: "损失一定更快降到 0", note: "它把权重推向损失增大的方向。" },
        ],
        correct: 0,
        reveal: "减去梯度是下坡方向；加上梯度会变成梯度上升。",
      },
      {
        id: "sgd-sparse",
        prompt:
          "词表有 5000 个词，一条短信含其中 8 个不同的词。假设 $p-y$ 不为 0、学习率大于 0，包含偏置在内，实际会改变几个参数？",
        options: [
          { label: "9 个：8 个出现的词，加上偏置" },
          { label: "5001 个：每次都改变整份词表", note: "没出现的词乘 0，数值保持不变。" },
        ],
        correct: 0,
        reveal: "8 个词的特征值是 1，偏置特征也恒为 1；其他权重乘 0 后保持不变。",
      },
    ],
  },
];

export const LOGISTIC_REGRESSION_CORE_STAGES = LOGISTIC_REGRESSION_STAGES.filter(
  (stage) => !stage.optional,
);

export function getLogisticRegressionStage(index: number): LogisticRegressionStageDef | undefined {
  return LOGISTIC_REGRESSION_STAGES.find((stage) => stage.index === index);
}

export function logisticRegressionStageUnlocked(
  passedStages: readonly number[],
  index: number,
): boolean {
  if (!getLogisticRegressionStage(index)) return false;
  if (index === 6) return passedStages.includes(4);
  return LOGISTIC_REGRESSION_CORE_STAGES.every(
    (stage) => stage.index >= index || passedStages.includes(stage.index),
  );
}

export function nextLogisticRegressionStage(passedStages: readonly number[]): number {
  for (const stage of LOGISTIC_REGRESSION_CORE_STAGES) {
    if (stage.index <= 4 && !passedStages.includes(stage.index)) return stage.index;
  }
  return passedStages.includes(5) ? 6 : 5;
}
