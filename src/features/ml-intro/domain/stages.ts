import type { CalibrationMessage } from "./logreg.ts";
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
    note: "这是一条正常消息。你可以查看哪些词进入了特征向量，再与广告短信比较。",
  },
  {
    id: "ham-trap",
    label: "带敏感词的正常消息",
    tag: "正常短信示例",
    text: "同学有一张优惠名额，明天一起去领取吧~",
    note: "这条正常消息也有「优惠」「领取」。模型能否分对，还要看「同学」「明天」「一起」等词的权重。",
  },
  {
    id: "oov-scam",
    label: "含新造词的诈骗",
    tag: "OOV 盲区",
    text: "元宇宙盲盒空投到账，速领限时空投奖励！",
    note: "「元宇宙」「盲盒」「空投」不在训练词表中。模型会忽略这些词，只计算已知词的得分。",
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
  { id: "tok-5", text: "元宇宙", displayNote: "训练词表内未收录", expected: "oov" },
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
    tag: "含触发词的正常短信",
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

export const EVAL_MIN_PRECISION = 0.9;
export const EVAL_MIN_RECALL = 0.8;
export const EVAL_MIN_ACCURACY = 0.95;

export const GENERALIZE_MIN_TEST_ACCURACY = 0.945;
export const GENERALIZE_MIN_TEST_PRECISION = 0.85;
export const GENERALIZE_MIN_TEST_RECALL = 0.75;
export const GENERALIZE_MAX_VAL_LOSS = 0.14;

export type MlStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  description: string;
  task: string;
  judgeNote: string;
  takeaway: string;
  hints: [string, string, string];
  prompts: ConceptPrompt[];
};

export const ML_STAGES: MlStageDef[] = [
  {
    index: 1,
    id: "strategy",
    title: "给 10 个词打分",
    englishTitle: "Strategy Game",
    description:
      "如果让你写一条拦截垃圾短信的规则，你会留意哪些词？这一关只用 10 个词。你给每个词设定分值，程序把短信中出现过的词的分值相加：总分达到 +1 就拦截，否则放行。",
    task: "请给 10 个词设置分值，让 6 条示例短信全部分对。你至少需要设置 2 个正分词和 2 个负分词，然后回答概念题。",
    judgeNote:
      "服务器按 w·x ≥ +1 的规则检查这 6 条短信，并核对正负分词的数量和概念题。全部符合要求后，你可以进入第 2 关。",
    takeaway:
      "你刚才给词设置的分值就是权重 w。短信中的词出现记 1，不出现记 0，这组数字就是 x。点积 w·x 把出现过的词的权重相加，得到一个分数；第 3 关会介绍怎样把分数转换为模型估计的概率。",
    hints: [
      "你可以先试着给「中奖、发票、退款、优惠」加分，给「妈妈、开会、老师」减分，再检查哪些短信仍然分错了。",
      "第 6 条是正常的报销消息，但也有「发票」「退款」。你需要让「妈妈、老师、开会」的负分抵消这些正分。",
      "「今天、明天、通知」在两类短信里都可能出现。你可以先把它们设为 0，看看第 5 条短信会不会被拦截。",
    ],
    prompts: [
      {
        id: "dot-product-strategy",
        prompt: "x 记录哪些词出现了，w 记录你给每个词的分值。程序计算 w·x 时，做了什么？",
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
            note: "点积是逐项相乘再相加（Σ w_i·x_i），不是全部权重连乘。",
          },
        ],
        correct: 1,
        reveal:
          "程序逐项计算 w_i·x_i，再相加。词没有出现时 x_i=0，不贡献分数；出现时 x_i=1，就加上它的权重。",
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
    title: "把短信变成数字",
    englishTitle: "Features",
    description:
      "模型不能直接计算一段中文。程序会先把短信切成词，再查训练集建立的词表：词出现了就记 1，没有出现就记 0。你可以修改下面的短信，看看这组数字怎样变化。",
    task: "请先试着重复一个词、添加标点或交换词序，观察结果。然后给测验句中的 7 个片段归类，并回答概念题。",
    judgeNote: "服务器会检查 7 个片段的归类和概念题。全部答对后，你可以进入第 3 关。",
    takeaway:
      "这组 0/1 数字叫作词袋向量。它记录词表中的哪些词出现过，不记录词序和重复次数。词表之外的词叫未见词（OOV），本模型不会为它们计算词语得分。",
    hints: [
      "词表中的词只要出现，对应位置就记 1。你再写一次这个词，数值仍然是 1；标点不会占用一个位置。",
      "「元宇宙」不在训练集词表里，对模型来说就是一个未见词（OOV）。",
      "本实验只用训练集建立词表。验证集和测试集要保留为新数据，才能检查模型面对未见过的表达时表现如何。",
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
            label: "向量维度顺序会跟着句子的词序一起调换",
            note: "词表列的顺序早在训练前就固定了，不会随单条短信改排。",
          },
          {
            label: "词袋会把整句话拼成一个拼音数字串",
            note: "词袋按词典建布尔特征位，不是整句编码。",
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
            label: "它会被当作未见词（OOV）忽略，对本次总分贡献为 0",
          },
          {
            label: "只要出现 OOV，整条短信立刻被判成垃圾短信",
            note: "未见词本身没有权重，不会单独把预测推高或拉低。",
          },
        ],
        correct: 1,
        reveal:
          "这个词没有对应的特征位置和权重，因此不参与本次评分。模型仍会计算短信中其他已知词的得分。",
      },
      {
        id: "train-only-vocab",
        prompt: "为什么词表只能从训练集生成，不能把测试集也一起收进词表？",
        options: [
          {
            label: "因为测试集文字太多内存装不下",
            note: "核心原因不是内存，而是评估公正性。",
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
          "词表也是从数据中学到的信息。只用训练集建词表，才能保留独立的测试数据，避免数据泄露。",
      },
    ],
  },
  {
    index: 3,
    id: "score",
    title: "把分数换成概率",
    englishTitle: "Linear Score",
    description:
      "逻辑回归先计算分数 z = w·x + b，再用 Sigmoid 函数把它转换为垃圾短信的预测概率。这里的 b 叫偏置，它决定没有已知词时的起始分数。下面的模型会误拦一些正常短信，你来调整它。",
    task: "请调整偏置和 8 个词的权重，让 6 条短信全部分对。模型把概率达到 50% 的短信判为垃圾；没有已知词时的概率也需要低于 50%。完成后回答概念题。",
    judgeNote:
      "服务器会重新计算 6 条短信的预测，检查它们是否全部分对、σ(b) 是否低于 50%，以及概念题是否全部答对。",
    takeaway:
      "偏置和词权重一起决定分数 z，Sigmoid 再把 z 转换为预测概率。z 为 0 时概率是 50%，z 越大概率越高。这个概率是模型的估计，不保证判断正确。下一关会让模型自己学习权重。",
    hints: [
      "起始偏置 b = +0.4，没有已知词时的垃圾概率约为 59.9%。你可以先把 b 调成负数，例如 −1.0。",
      "你可以把「同学」「明天」「一起」的权重调到 −1.6 至 −2.0，观察含有「优惠」或「免费」的正常短信会怎样变化。",
      "请点选一条短信，再调整一个词的权重。看看它的总分 z 和曲线上的概率是否一起变化。",
    ],
    prompts: [
      {
        id: "bias-meaning",
        prompt: "如果一条短信没有任何词命中词表，模型预测的垃圾概率由什么决定？",
        options: [
          {
            label: "一定输出 0，因为没有词汇得分",
            note: "词语得分是 0，但模型还会加上偏置 b，再计算 sigmoid(b)。",
          },
          {
            label: "由基准偏置 b 决定，即 p = sigmoid(b)",
          },
          {
            label: "随机猜一个 0 到 1 之间的数",
            note: "线性模型完全确定，不存在随机输出。",
          },
        ],
        correct: 1,
        reveal: "没有词命中时，w·x=0，总分就等于 b。此时模型输出 sigmoid(b)，不一定是 0 或 50%。",
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
            note: "Sigmoid 只负责单调压缩总分 z，本身不挑词。",
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
    title: "让模型调整权重",
    englishTitle: "Gradient Descent",
    description:
      "词表里有上千个词，逐个手调很费时间。这一关，模型从零权重开始，逐条读取有标签的短信，再按预测误差调整权重。你来设置学习率 η 和训练轮数，观察训练结果。",
    task: "请调整学习率和轮数，让训练损失不高于 0.08，验证损失不高于 0.12。你可以先比较几组预设，再回答概念题。",
    judgeNote:
      "服务器会使用你的学习率和轮数重新训练模型。两项损失达到要求、概念题全部答对后，你可以进入第 5 关。",
    takeaway:
      "随机梯度下降（SGD）每读一条短信就更新一次权重。对本条短信中出现的词，更新量是 −η·(p−y)。学习率决定每次改多少；改得太小，训练可能很慢，改得太大，损失可能来回波动。",
    hints: [
      "请比较 η = 0.002 和 η = 5.0 时的损失曲线，再试试 0.05 到 0.25 之间的值。哪一组能让训练损失和验证损失一起下降？",
      "SGD 更新公式是 w ← w − η·(p − y)。真实标签 y=1、模型预测 p=0.2 时，p−y = −0.8。减去一个负数，会让这条短信中出现的词的权重增大。",
      "你可以从 η = 0.1、12 到 16 轮开始。拖动回放滑块，看看「TD」「退订」「免费」的权重如何从 0 开始变化。",
    ],
    prompts: [
      {
        id: "sgd-vs-bgd",
        prompt:
          "为什么随机梯度下降（SGD）的曲线会逐步波动，而全批量梯度下降（BGD）每轮只更新一次？",
        options: [
          {
            label: "SGD 用一条短信的误差更新权重；BGD 用全部训练短信的平均梯度更新权重",
          },
          {
            label: "SGD 在每条短信后都会把部分权重随机清零",
            note: "标准 SGD 不会清零权重，只是每次用单个样本的梯度近似整体梯度。",
          },
          {
            label: "因为 BGD 的学习率被强行限制不能超过 0.0001",
            note: "两种方法的区别在于每次用多少样本计算更新方向，不在于这个学习率限制。",
          },
        ],
        correct: 0,
        reveal:
          "SGD 每条短信更新一次，本实验一轮最多更新 1,400 次。BGD 把整批样本的梯度取平均，一轮更新一次。",
      },
      {
        id: "update-math",
        prompt:
          "一条垃圾短信的标签 y=1，模型预测 p=0.20，学习率 η=0.1。对这条短信中出现的词，权重更新量 Δw 是多少？",
        options: [
          {
            label: "Δw = −0.08（把权重往下压）",
            note: "请代入公式：−0.1×(0.2−1)=+0.08。负数乘负数得到正数。",
          },
          {
            label: "Δw = +0.08（把权重往正方向抬高）",
          },
          {
            label: "Δw = +0.10（只与学习率有关，与猜错多少无关）",
            note: "更新量还取决于预测值与标签的差 p−y，不只取决于学习率。",
          },
        ],
        correct: 1,
        reveal:
          "Δw = −0.1×(0.20−1)=+0.08。这些词的权重增加后，模型对类似短信的垃圾概率估计会提高。",
      },
    ],
  },
  {
    index: 5,
    id: "evaluate",
    title: "检查模型分错了什么",
    englishTitle: "Confusion Matrix",
    description:
      "验证集的 300 条短信中，有 258 条是正常短信。模型即使把所有短信都判为正常，也有 86% 的准确率，却拦不住任何垃圾短信。你需要分别查看它误拦了多少正常消息、漏掉了多少垃圾短信。",
    task: "请调整分类阈值 τ，让验证集准确率至少达到 95%、查准率达到 90%、查全率达到 80%。再点开混淆矩阵中的误判短信，查看原因并回答概念题。",
    judgeNote:
      "服务器会用你的参数重新训练模型，再按阈值分类。验证集的三项指标达到要求、概念题全部答对后，你可以进入第 6 关。",
    takeaway:
      "混淆矩阵把正确和错误的分类分成四种情况。误拦正常短信叫误报（FP），漏掉垃圾短信叫漏报（FN）。你提高阈值后，模型会拦截更少的短信，误报和漏报的数量也会改变。",
    hints: [
      "先把阈值降到 0.10，看看模型多拦截了哪些短信。查全率提高的同时，查准率是否也达到了要求？",
      "再把阈值提高到 0.85，查看漏报（FN）这一格。模型放过了哪些垃圾短信？",
      "你可以保持 η = 0.1、12 轮，在 0.30 到 0.50 之间调整阈值，再点开一条误报或漏报，查看各个词贡献了多少分。",
    ],
    prompts: [
      {
        id: "baseline-trap",
        prompt:
          "一组短信中有 86% 正常、14% 垃圾。把所有短信都判为正常的模型，为什么不能完成过滤任务？",
        options: [
          {
            label: "因为准确率只有 86%，没达到 90%",
            note: "准确率无法单独说明模型是否拦住了垃圾短信，还要查看它的查全率。",
          },
          {
            label: "因为它漏掉了全部垃圾短信，查全率为 0%，即使准确率有 86%",
          },
          {
            label: "因为这会导致交叉熵损失变成负数",
            note: "交叉熵损失永远非负。",
          },
        ],
        correct: 1,
        reveal:
          "这个模型的 86% 来自正常短信占多数，并不代表它能识别垃圾短信。你还需要检查查准率和查全率。",
      },
      {
        id: "fp-meaning",
        prompt: "如果模型把老师的考试通知判成垃圾短信，这对应混淆矩阵的哪一格？",
        options: [
          {
            label: "TP（真阳性）",
            note: "TP 是「本来就是垃圾，也被成功拦住」。",
          },
          {
            label: "FP（假阳性 / 误报）",
          },
          {
            label: "FN（假阴性 / 漏报）",
            note: "FN 是「本来是垃圾，却被放过去了」。",
          },
        ],
        correct: 1,
        reveal:
          "正常短信的真实标签是 0，模型却预测为 1，这就是误报（FP）。在短信过滤中，你还需要考虑误拦重要通知的代价。",
      },
      {
        id: "threshold-tradeoff",
        prompt:
          "把阈值从 0.50 提高到 0.85 后，模型只拦截预测概率至少为 85% 的短信。查准率和查全率通常怎样变化？",
        options: [
          {
            label: "查准率通常提高，查全率可能下降，因为模型拦截的短信更少了",
          },
          {
            label: "Precision 和 Recall 会同时提高",
            note: "提高阈值后，一部分原来被拦截的短信会放行，其中也可能包含垃圾短信。",
          },
          {
            label: "两项指标都不会改变",
            note: "模型权重没变，但划进「拦下」还是「放行」的边界变了。",
          },
        ],
        correct: 0,
        reveal:
          "提高阈值会减少拦截数量，查全率不会因此提高。查准率通常会提高，但还要看实际数据，不能只凭阈值保证。",
      },
    ],
  },
  {
    index: 6,
    id: "generalize",
    title: "用新短信检验模型",
    englishTitle: "Generalization",
    description:
      "模型在训练短信上表现好，换一批短信还能分对吗？你可以先比较不同训练样本量的结果。服务器另有 300 条未公开的测试短信，用来检查模型处理新数据的能力，也就是泛化能力。",
    task: "请比较小样本和 1,400 条样本的训练结果，观察验证指标与未见词比例。你根据验证集选择样本量、学习率、轮数和阈值，回答概念题后，提交给服务器测试。",
    judgeNote:
      "服务器会重新训练模型，要求验证损失不高于 0.14，测试集准确率至少达到 94.5%、查准率达到 85%、查全率达到 75%，并检查概念题。测试集只返回是否通过，不提供详细指标；你应根据公开验证集调整参数。",
    takeaway:
      "训练集成绩说明模型对练习数据的表现，验证集和测试集帮助你检查它能否处理新短信。增加训练样本可以扩大词表，但你仍需检查误判，避免模型只记住训练数据中的偶然规律。",
    hints: [
      "请先选 150 条训练样本，比较训练集和验证集的准确率，再查看验证集中的未见词比例。训练集分得准，是否代表新短信也能分准？",
      "你可以再试 1,000 到 1,400 条样本，学习率 0.08 到 0.15、10 到 15 轮、阈值 0.35 到 0.50。比较验证结果后，再输入自己写的短信。",
      "请留意权重较高的 TEL、URL、ID 等脱敏标记。模型可能学到的是语料的整理方式，而不是能用于新短信的分类线索。",
    ],
    prompts: [
      {
        id: "overfit-sign",
        prompt:
          "只用 150 条短信训练时，如果训练准确率达到 100%，验证集却漏掉全部垃圾短信，这说明什么？",
        options: [
          {
            label: "模型可能过拟合，词表也可能覆盖不足；它在训练数据上表现好，却不能处理新短信",
          },
          {
            label: "说明 150 条数据质量特别完美，不需要更多样本",
            note: "训练准确率高只说明模型能分对这些训练样本，还需要用新数据检查。",
          },
          {
            label: "模型在训练集上已分对全部短信，只需继续增加训练轮数",
            note: "继续训练不一定能改善新短信的分类。你还需要检查样本量、词表覆盖和验证结果。",
          },
        ],
        correct: 0,
        reveal:
          "模型在训练集上表现很好，换成新数据后明显变差，可能发生了过拟合。你还要结合未见词比例，检查词表覆盖是否足够。",
      },
      {
        id: "oov-shrink",
        prompt:
          "为什么随着训练样本数从 200 扩大到 1,400，未知短信里的未见词比例（OOV Rate）会大幅下降？",
        options: [
          {
            label: "因为训练越久模型越会主动删词",
            note: "删词不会减少未见词，真正原因是常见用词在更多短信中被覆盖进词表了。",
          },
          {
            label: "训练语料覆盖了更多真实表达方式，常见词与变体都被收录进词表了",
          },
          {
            label: "因为测试集会被自动缩短",
            note: "测试集自始至终保持不变。",
          },
        ],
        correct: 1,
        reveal:
          "增加训练样本后，词表通常能覆盖更多表达，验证短信里的未见词会减少。你仍需比较验证指标，确认分类效果是否改善。",
      },
      {
        id: "spurious-tokens",
        prompt:
          "在真实脱敏语料词权榜中，有时会看到「TEL」「URL」「TD」或单字权重很高。这提醒我们什么？",
        options: [
          {
            label: "模型也可能依赖脱敏标记等偶然线索，所以我们需要检查高权重词，并用独立数据测试",
          },
          {
            label: "只要出现格式标记的句子在现实中一定是垃圾短信",
            note: "TEL/URL 是语料脱敏后的格式标记，未必按同样写法出现在真实线上环境中。",
          },
          {
            label: "权重越大的单个字母代表人类语法越重要",
            note: "线性模型不知道人类语法，只统计标签相关性。",
          },
        ],
        correct: 0,
        reveal:
          "较高的权重说明这个词与训练标签相关，不代表它能可靠地判断新短信。你需要检查数据的整理方式，再用独立数据验证。",
      },
    ],
  },
];

export const ML_CORE_STAGES = ML_STAGES;

export function getMlStage(index: number): MlStageDef | undefined {
  return ML_STAGES.find((stage) => stage.index === index);
}

export function mlStageUnlocked(passedStages: readonly number[], index: number): boolean {
  if (!getMlStage(index)) return false;
  return index === 1 || passedStages.includes(index) || passedStages.includes(index - 1);
}

export function nextMlStage(passedStages: readonly number[]): number {
  for (const stage of ML_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return ML_STAGES.length + 1;
}
