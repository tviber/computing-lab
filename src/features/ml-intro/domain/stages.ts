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
    tag: "垃圾短信典型",
    text: "【特惠】免费领取现金红包！！点击链接立即兑换，回复TD退订",
    note: "「免费」「领取」「红包」「点击」「TD」「退订」会成为正权重候选特征，感叹号和方括号被直接过滤。",
  },
  {
    id: "ham-normal",
    label: "日常沟通",
    tag: "正常短信",
    text: "明天下午和同学一起去学校看电影，别忘了带手机！",
    note: "「明天」「同学」「一起」「学校」「手机」在语料里大多属于日常对话，帮模型识别正常短信。",
  },
  {
    id: "ham-trap",
    label: "带敏感词的正常消息",
    tag: "最易误判",
    text: "同学有一张优惠名额，明天一起去领取吧~",
    note: "同时出现「优惠」「领取」和「同学」「明天」「一起」。光把文本切成词还不够，下一步得给不同词打正负分。",
  },
  {
    id: "oov-scam",
    label: "含新造词的诈骗",
    tag: "OOV 盲区",
    text: "元宇宙盲盒空投到账，速领限时空投奖励！",
    note: "「元宇宙」「盲盒」「空投」从未出现在训练词表里：模型完全看不见它们，只能按有记录的词打分。",
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
    title: "直觉策略：给 10 个词打分",
    englishTitle: "Strategy Game",
    description:
      "先不急着上公式：假设整门语言一共只有 10 个词，给每个词设定正相关、负相关或无关的权重，用点积 w · x 直接算出一条短信总分，再通过分段概率表看看你的规则会不会误伤正常消息。",
    task: "拖动滑块或直接输入数值，为 10 个词设定权重（正相关 >0、负相关 <0、无关 0），让 6 条 10 词示例短信全部分对（垃圾 ≥50%，正常 <50%），并至少包含 2 个正权重和 2 个负权重后完成概念题。",
    judgeNote:
      "服务器核对你的 10 词权重策略（至少 2 正 2 负）、6 条 10 词短信是否全部分对及概念题是否全对，全对解锁第 2 关。",
    takeaway:
      "「每个词出现记 1、乘权重再求和」的 w · x 点积本身就是一种可解释的分类策略。当语料从 10 个词扩展到上千词时，就需要正式建词表、用偏置 b 与 Sigmoid 输出概率。",
    hints: [
      "「中奖、发票、退款、优惠」偏向垃圾线索设为正数，「妈妈、开会、老师」偏向日常线索设为负数。",
      "第 6 条「妈妈明天和老师开会，要今天的发票和退款」里混进了「发票」「退款」：只有把「妈妈、老师、开会」设为负数且压得住正分，才不会把报销沟通误杀。",
      "「今天、明天、通知」两边都会出现：设为 0 保持中立，否则第 5 条纯中性短信「今天和明天的通知」就会被推成垃圾。",
    ],
    prompts: [
      {
        id: "dot-product-strategy",
        prompt:
          "当短信被写成由 0/1 组成的特征向量 x，并配上一组词权重 w 时，计算点积 w · x 实质是在做什么？",
        options: [
          {
            label: "只统计短信总字数并按出现先后顺序加权",
            note: "点积只按词典位置加权求和，不依赖字数与前后顺序。",
          },
          {
            label: "只把这条短信里出现过的词（x_i = 1）对应的权重 w_i 相加得到总分",
          },
          {
            label: "把 10 个词权重直接连乘，只要有一个无关词为 0 总分就归零",
            note: "点积是逐项相乘再相加（Σ w_i·x_i），不是全部权重连乘。",
          },
        ],
        correct: 1,
        reveal:
          "正确。w · x = Σ w_i·x_i 会跳过未出现的词（x_i = 0），把出现过的词的正负权重相加得到净倾向分。",
      },
      {
        id: "neutral-zero",
        prompt:
          "像「今天」「明天」「通知」这样在日常通知与营销短信里都常见的词，策略权重怎么设更合理？",
        options: [
          {
            label: "设为大整数 +4，见到「通知」就先拦下再说",
            note: "日常家校与工作消息也常出现「通知」，设为强正权会导致频繁误杀。",
          },
          {
            label: "保持在 0 附近（无关），把加减分留给真正有区分度的线索词",
          },
          {
            label: "设为 -5，用它硬抵消掉所有「中奖」「退款」",
            note: "如果「通知」拿到 -5，带「中奖通知」的垃圾短信就会漏网。",
          },
        ],
        correct: 1,
        reveal: "正确。在正负两类消息里都高频出现的词没有区分度，权重保持在 0 附近最稳妥。",
      },
    ],
  },
  {
    index: 2,
    id: "tokenize",
    title: "把短信变成数字",
    englishTitle: "Features",
    description:
      "第 1 关只有 10 个固定词汇；面对真实世界里千变万化的中文短信，机器第一步必须先切词、去标点，并把文本映射到训练集词表的 0/1 特征向量。",
    task: "先在上方实验区观察切词、重复词、标点过滤和词序互换的效果，再把下方测验句的 7 个片段正确归类并答对概念题。",
    judgeNote:
      "服务器核对 7 个切词片段的归类（入表 / 重复忽略 / 标点过滤 / 未见词 OOV）与全部概念题，全对解锁第 3 关。",
    takeaway:
      "0/1 词袋把文本变成机器能算的向量，但代价是丢掉了词序、词频和训练词表之外的新词（OOV）。",
    hints: [
      "只有首次出现且在训练词表内的词会点亮向量里的 1；标点和第二次出现的词都不会再新增维度。",
      "「元宇宙」不在训练集词表里，对模型来说就是一个未见词（OOV）。",
      "建词表绝对不能偷看验证集或测试集，否则相当于考前泄题，上考场遇到真新词立刻暴露。",
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
        reveal: "正确。词袋（Bag-of-Words）把句子当成装词的袋子，天然丢失词序。",
      },
      {
        id: "oov-effect",
        prompt: "如果诈骗短信突然发明了一个训练集中从未出现过的新词，预测时会怎样？",
        options: [
          {
            label: "机器会自动联网查词典补出权重",
            note: "离线分类器不会自己发明维度或查表外含义。",
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
        reveal: "正确。未见词（OOV）没有对应的特征列和权重，对模型是隐形的。",
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
            label: "收进测试词相当于偷看考卷结构，会掩盖模型面对真实新词时的脆弱",
          },
          {
            label: "把测试词收进词表能让所有未见词自动算出正确权重",
            note: "就算提前占好位置，测试集中只出现一次的词在训练期梯度也是 0。",
          },
        ],
        correct: 1,
        reveal: "正确。严格隔离训练集与测试集词表（防数据泄露），评测才真实可信。",
      },
    ],
  },
  {
    index: 3,
    id: "score",
    title: "给词打分与概率",
    englishTitle: "Linear Score",
    description:
      "第 1 关用分段概率表做了一个 10 词小游戏；在真正的统计分类器里，机器会用偏置 b 设好零线索基准，再用平滑的 Sigmoid 函数把线性总分 z = w·x + b 连续映射成 0~1 概率。",
    task: "调节下方 8 个词的权重和偏置 b，让 6 条测试短信全部分类正确（垃圾 ≥50%，正常 <50%），且无特征短信保持判定为正常（b < 0），再完成概念题。",
    judgeNote:
      "服务器用你提交的 8 个词权重与偏置 b，校验全部分诊短信是否 6/6 判对、空消息基线是否低于 50%，以及概念题是否全对。",
    takeaway:
      "正权重（垃圾线索）与负权重（日常线索）会互相抵消，再由偏置 b 和 Sigmoid 输出 0~1 概率。但手工调 8 个词尚且互相打架，面对上千个词只能让机器自己学。",
    hints: [
      "先把「免费」「领取」「点击」「退订」「优惠」往正数调高，看哪几条正常短信被误杀了。",
      "「同学」「明天」「一起」是典型日常线索：把它们调成负数（比如 -1.6 到 -2.4），就能抵消误触发词的分数。",
      "把偏置 b 保持在负数（如 -1.0）：没有命中任何已知词时，模型默认短信是正常的。",
    ],
    prompts: [
      {
        id: "bias-meaning",
        prompt: "如果一条短信全部都是新词（没有任何词命中词表），模型会输出多少概率？",
        options: [
          {
            label: "一定输出 0，因为没有词汇得分",
            note: "总分 z=0 时，Sigmoid(0) 等于 0.5（50%），不是 0！",
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
        reveal:
          "正确。偏置 b 代表「零线索下的先验倾向」：真实短信多数正常，所以训练后的 b 通常为负。",
      },
      {
        id: "counter-weight",
        prompt:
          "为什么给「同学」「一起」设负权重后，「同学有一张优惠名额，明天一起去领取吧」就不会被误杀？",
        options: [
          {
            label: "因为遇到日常词会直接跳过后面的词不看",
            note: "线性模型不会短路跳过，每个词都会参与求和。",
          },
          {
            label: "因为多条负权重累加后抵消了「优惠」「领取」的正权重，把总分拉回 0 以下",
          },
          {
            label: "因为 Sigmoid 会自动删除正常词",
            note: "Sigmoid 只负责单调压缩总分 z，本身不挑词。",
          },
        ],
        correct: 1,
        reveal: "正确。线性打分就是正反证据相加减的拔河比赛，比硬编码黑名单灵活得多。",
      },
    ],
  },
  {
    index: 4,
    id: "train",
    title: "让机器自己改错",
    englishTitle: "Gradient Descent",
    description:
      "真实短信词表有上千维，不可能手工调权重。机器从所有权重为 0（盲猜损失 ln 2 ≈ 0.693）出发，用交叉熵衡量错得有多离谱，再用学习率 η 沿负梯度自动更新权重。",
    task: "在真实语料上调节学习率 η 与训练轮数，让最终训练损失 ≤ 0.08 且验证损失 ≤ 0.12（既不能慢到学不动，也不能太大而震荡），并答对梯度更新问题。",
    judgeNote:
      "服务器用你的学习率 η 和轮数从零重训模型，核对训练损失 ≤ 0.08、验证损失 ≤ 0.12 且概念题全对。",
    takeaway:
      "梯度下降按「步长 η × 误差 (p − y)」修正每个出现过的词权：η 太小像蜗牛爬，太大在山谷里左右甩飞；随机梯度下降（SGD）单步抖动却能一轮改上千次，收敛极快。",
    hints: [
      "把学习率调到 0.002 看曲线几乎滑不下来，调到 5.0 看验证损失居高震荡；试试 0.05 到 0.25 之间的区间。",
      "SGD 更新公式是 w ← w − η·(p − y)：真实标签 y=1 却猜成 p=0.2 时，p−y = −0.8，减一个负数就会把权重往正方向抬。",
      "试试 η = 0.1、12 到 16 轮，同时观察词权榜里「TD」「退订」「免费」是如何从 0 逐渐分化的。",
    ],
    prompts: [
      {
        id: "sgd-vs-bgd",
        prompt:
          "为什么同一轮训练里，随机梯度下降（SGD）的损失曲线呈锯齿抖动，而全批量梯度下降（BGD）非常平滑？",
        options: [
          {
            label:
              "SGD 每读一条短信就立刻改权重，受单条样本噪音影响左右摇摆；BGD 看完所有短信才平均更新一次",
          },
          {
            label: "SGD 在每条短信后都会把部分权重随机清零",
            note: "标准 SGD 不会清零权重，只是每次用单个样本的梯度近似整体梯度。",
          },
          {
            label: "因为 BGD 的学习率被强行限制不能超过 0.0001",
            note: "就算相同 η，单条更新的方差天然远大于全样本平均。",
          },
        ],
        correct: 0,
        reveal:
          "正确。SGD 用单条样本高频小步逼近，一轮就能更新上千次；BGD 方向稳但一轮只迈一大步。",
      },
      {
        id: "update-math",
        prompt:
          "一条真垃圾短信（y = 1）被模型猜成 p = 0.20，若学习率 η = 0.1，这条短信出现过的词权重 Δw 是多少？",
        options: [
          {
            label: "Δw = −0.08（把权重往下压）",
            note: "注意符号：w ← w − η·(p − y) = w − 0.1×(0.2 − 1) = w + 0.08！",
          },
          {
            label: "Δw = +0.08（把权重往正方向抬高）",
          },
          {
            label: "Δw = +0.10（只与学习率有关，与猜错多少无关）",
            note: "误差 (p − y) 决定了纠正力度：错得越惨，推力越大。",
          },
        ],
        correct: 1,
        reveal: "正确。Δw = −0.1 × (0.20 − 1) = +0.08，预测越离谱，拉回来的力量越大。",
      },
    ],
  },
  {
    index: 5,
    id: "evaluate",
    title: "别被高分假象骗了",
    englishTitle: "Confusion Matrix",
    description:
      "真实短信里约 86% 都是正常短信：哪怕一个「永远猜正常」的懒惰模型都有 86% 准确率，可它抓住的垃圾短信是 0。只看准确率会被严重误导。",
    task: "调节判决阈值 τ（及需要时微调模型），在 300 条验证集上同时满足：准确率 ≥ 95%、查准率 Precision ≥ 90%、查全率 Recall ≥ 80%，并点击混淆矩阵拆解误判短信后回答概念题。",
    judgeNote:
      "服务器用你提交的超参重训模型并按阈值 τ 切分预测结果，要求验证集 Precision ≥ 90%、Recall ≥ 80%、Accuracy ≥ 95% 且概念题全对。",
    takeaway:
      "在不平衡分类里必须拆开看 2×2 混淆矩阵：误杀正常通知是假阳性 FP，放走诈骗是假阴性 FN；阈值 τ 就是二者之间此消彼长的开关。",
    hints: [
      "看看阈值曲线：τ 压得太低（比如 0.10）时 Recall 很高，但正常短信会被误杀一大片（Precision 掉到 90% 以下）。",
      "τ 抬得太高（比如 0.85）时误杀很少，但很多伪装得礼貌的垃圾短信会漏网（Recall 跌破 80%）。",
      "保持 η = 0.1、12 轮，把阈值 τ 放在 0.30 到 0.50 之间，点开一条 FP 或 FN 短信看看是哪个词带偏了模型。",
    ],
    prompts: [
      {
        id: "baseline-trap",
        prompt:
          "在「86% 正常 + 14% 垃圾」的数据集上，如果模型不管三七二十一全猜正常，为什么它是废模型？",
        options: [
          {
            label: "因为准确率只有 86%，没达到 90%",
            note: "重点不是数字本身，而是它根本没有做出任何区分能力。",
          },
          {
            label:
              "因为它一条垃圾也没拦住（Recall = 0%），却用绝大多数正常样本凑出了看似很高的准确率",
          },
          {
            label: "因为这会导致交叉熵损失变成负数",
            note: "交叉熵损失永远非负。",
          },
        ],
        correct: 1,
        reveal:
          "正确。类别不平衡时，始终猜多数类就是盲猜基线（Baseline），任何真模型都必须拆出查准率与查全率对比它。",
      },
      {
        id: "fp-meaning",
        prompt: "如果老师发来的重要考试通知被过滤器误关进了垃圾箱，这对应混淆矩阵的哪一格？",
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
          "正确。正常短信被误判为垃圾（y=0 却 pred=1）就是 FP（误杀），往往比漏一条广告更让人头疼。",
      },
      {
        id: "threshold-tradeoff",
        prompt:
          "把判定阈值 τ 从 0.50 严格提高到 0.85（只有把握 ≥85% 才拦），Precision 和 Recall 通常怎么变？",
        options: [
          {
            label: "Precision 升高（更少误杀），但 Recall 下降（更多垃圾漏网）",
          },
          {
            label: "Precision 和 Recall 会同时提高",
            note: "阈值只是在同一排预测概率上切一刀，收紧门槛必然让部分可疑真垃圾漏过去。",
          },
          {
            label: "两项指标都不会改变",
            note: "模型权重没变，但划进「拦下」还是「放行」的边界变了。",
          },
        ],
        correct: 0,
        reveal:
          "正确。阈值提高会滤掉拿不准的误报，提高查准率，同时不可避免放过一批模棱两可的垃圾短信。",
      },
    ],
  },
  {
    index: 6,
    id: "generalize",
    title: "数据规模与未知大考",
    englishTitle: "Generalization",
    description:
      "前面你只看得见公开训练集和 300 条验证集。服务器还封存了一份从未露面的 300 条隐藏测试集：训练集太小会死记硬背生词、在陌生考卷上一落千丈。调参请依据公开验证集完成，隐藏测试集仅作结业盲测验证。",
    task: "切换训练样本量对比「200 条 vs 1400 条」的训练集/验证集差距与 OOV 比例，依据公开验证集配出最有泛化力的方案（样本量、学习率、轮数、阈值），再提交挑战服务器 300 条隐藏盲测，并完成概念题。",
    judgeNote:
      "服务器用你的参数配置在训练集切片上重新训练后，直接评测浏览器从未见过的 300 条隐藏测试集（要求准确率 ≥ 94.5%、Precision ≥ 85%、Recall ≥ 75% 且公开验证损失 ≤ 0.14）。为避免把隐藏测试集当成第二份验证集反复调参，判题仅反馈是否综合达标，不暴露隐藏集详细指标。",
    takeaway:
      "机器学习追的不是「训练集考 100 分」，而是对未来陌生样本的泛化能力。更多样的训练数据降低 OOV 盲区、合理学习率与轮数防止过拟合噪声，才是上线能打的真模型。",
    hints: [
      "把样本量拖到 150~200 试试：你会发现训练集准确率瞬间 100%，但验证集近四到六成词变成未见词（OOV），召回率暴跌。",
      "样本量给足（如 1000~1400），用 η = 0.08~0.15、轮数 10~15、阈值 0.35~0.50，再拿自己编的新短信测测看会不会踩坑。",
      "也可以留意词权榜里的高权脱敏标记（如 TEL、URL、ID）或单字：小样本或盲信数据采集格式时，模型极易把偶然痕迹当成强特征。",
    ],
    prompts: [
      {
        id: "overfit-sign",
        prompt:
          "只用 150 条短信训练时，模型在训练集拿到 100% 准确率，验证集却一条垃圾也抓不到，这是什么现象？",
        options: [
          {
            label: "典型过拟合加词表覆盖不足：模型死记了 150 条里的偶发词，遇到陌生短信全是 OOV",
          },
          {
            label: "说明 150 条数据质量特别完美，不需要更多样本",
            note: "训练集 100% 往往只是记忆量够小，不是学会了规律。",
          },
          {
            label: "是因为学习率不能用小数",
            note: "η=0.1 是标准学习率，病根是训练样本太少、词表狭窄。",
          },
        ],
        correct: 0,
        reveal:
          "正确。死背小样本叫「过拟合（Overfitting）」：考试只考背过的题拿满分，换张卷子立刻现原形。",
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
          "正确。见多才识广：足够多的样本既扩大词表覆盖（降 OOV），又稀释偶然噪声词汇的权重。",
      },
      {
        id: "spurious-tokens",
        prompt:
          "在真实脱敏语料词权榜中，有时会看到「TEL」「URL」「TD」或单字权重很高。这提醒我们什么？",
        options: [
          {
            label:
              "模型会抓住数据里一切统计捷径，哪怕那是脱敏占位符或标注习惯，所以特征清洗与真测试集同样关键",
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
          "正确。机器学习忠实放大数据里的统计相关性，检查高权特征与用陌生真数据盲测一样不可或缺。",
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
  return index === 1 || passedStages.includes(index - 1);
}

export function nextMlStage(passedStages: readonly number[]): number {
  for (const stage of ML_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return ML_STAGES.length + 1;
}
