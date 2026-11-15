/**
 * Browser-safe Chinese + alphanumeric tokenizer for interactive SMS probing.
 * Segmentation boundaries use the known vocabulary plus common compound cues,
 * while kept vs. OOV status checks strictly against the training vocabulary so
 * unseen words never falsely look learned.
 */

export type RawTokenStatus = "kept" | "duplicate" | "filtered" | "oov";

export type TokenItem = {
  text: string;
  status: RawTokenStatus;
  vocabIndex: number | null;
  note: string;
};

export type ScoreTerm = {
  kind: "bias" | "token";
  word: string;
  weight: number;
  cumulativeZ: number;
};

export type MessageInspection = {
  text: string;
  tokens: TokenItem[];
  keptWords: string[];
  duplicateWords: string[];
  oovWords: string[];
  filteredTokens: string[];
  terms: ScoreTerm[];
  bias: number;
  rawZ: number;
  probability: number;
  pred: 0 | 1;
};

const DEMO_COMPOUNDS = [
  "元宇宙",
  "盲盒",
  "空投",
  "优惠券",
  "辅导员",
  "四六级",
  "验证码",
  "微信号",
  "拼多多",
  "教学楼",
  "笔记本",
  "现金红包",
  "红包",
  "奶茶",
  "食堂",
  "退订",
  "回复",
  "特惠",
  "折扣",
  "限时",
  "免费",
  "领取",
  "点击",
  "链接",
  "中奖",
  "恭喜",
  "客服",
  "积分",
  "兑换",
  "明天",
  "下午",
  "上午",
  "今天",
  "同学",
  "朋友",
  "开会",
  "借我",
  "谢谢",
  "好评",
  "激活",
  "神秘",
  "微信",
  "京东",
  "淘宝",
  "支付宝",
  "全场",
  "商城",
  "尊敬",
  "客户",
  "用户",
  "通知",
  "作业",
  "考试",
  "教室",
  "电脑",
  "别错过",
  "好礼",
  "快递",
  "取件码",
];

const CJK_RE = /[\u4e00-\u9fff]/;
const ASCII_WORD_RE = /^[a-zA-Z0-9]+/;
const SPACE_RE = /^\s+/;

type SegCache = {
  vocab: Set<string>;
  lexicon: Set<string>;
  maxLen: number;
};

let lastSegCache: SegCache | null = null;

function buildSegLexicon(vocab: Set<string>): SegCache {
  if (lastSegCache && lastSegCache.vocab === vocab) return lastSegCache;
  const lexicon = new Set<string>(vocab);
  let maxLen = 1;
  for (const w of vocab) {
    if (w.length > maxLen && w.length <= 8) maxLen = w.length;
  }
  for (const w of DEMO_COMPOUNDS) {
    lexicon.add(w);
    if (w.length > maxLen) maxLen = w.length;
  }
  lastSegCache = { vocab, lexicon, maxLen: Math.min(maxLen, 8) };
  return lastSegCache;
}

function stableSigmoid(z: number): number {
  if (z >= 35) return 1;
  if (z <= -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

function segmentPiecewise(
  text: string,
  lexicon: Set<string>,
  maxLen: number,
): {
  raw: string;
  isWord: boolean;
}[] {
  const out: { raw: string; isWord: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const spaceMatch = SPACE_RE.exec(rest);
    if (spaceMatch) {
      i += spaceMatch[0].length;
      continue;
    }
    const asciiMatch = ASCII_WORD_RE.exec(rest);
    if (asciiMatch) {
      out.push({ raw: asciiMatch[0], isWord: true });
      i += asciiMatch[0].length;
      continue;
    }
    if (CJK_RE.test(text[i])) {
      let matched = text[i];
      const upper = Math.min(maxLen, text.length - i);
      for (let len = upper; len >= 2; len--) {
        const cand = text.slice(i, i + len);
        if (lexicon.has(cand)) {
          matched = cand;
          break;
        }
      }
      out.push({ raw: matched, isWord: true });
      i += matched.length;
      continue;
    }
    out.push({ raw: text[i], isWord: false });
    i += 1;
  }
  return out;
}

/** Tokenize text and tag each segment for Bag-of-Words construction. */
export function analyzeTokens(
  text: string,
  trainVocab: Set<string>,
  wordToIndex?: ReadonlyMap<string, number>,
): TokenItem[] {
  const { lexicon, maxLen } = buildSegLexicon(trainVocab);
  const rawSegments = segmentPiecewise(text.trim(), lexicon, maxLen);
  const seenInMessage = new Set<string>();
  const tokens: TokenItem[] = [];

  for (const seg of rawSegments) {
    if (!seg.isWord) {
      tokens.push({
        text: seg.raw,
        status: "filtered",
        vocabIndex: null,
        note: "标点或符号，切词预处理阶段过滤",
      });
      continue;
    }
    if (!trainVocab.has(seg.raw)) {
      tokens.push({
        text: seg.raw,
        status: "oov",
        vocabIndex: null,
        note: "训练词表从未见过的新词 (OOV)，没有对应特征位",
      });
      continue;
    }
    const idx = wordToIndex?.get(seg.raw) ?? null;
    if (seenInMessage.has(seg.raw)) {
      tokens.push({
        text: seg.raw,
        status: "duplicate",
        vocabIndex: idx,
        note: "同一条短信里再次出现，0/1 词袋只记为出现过(1)",
      });
      continue;
    }
    seenInMessage.add(seg.raw);
    tokens.push({
      text: seg.raw,
      status: "kept",
      vocabIndex: idx,
      note: "在训练词表中首次出现，点亮对应维度 x_i = 1",
    });
  }

  return tokens;
}

/**
 * Inspect any custom or dataset message under a given weight vector & bias,
 * yielding both token status and cumulative dot-product score breakdown.
 */
export function inspectMessageWithModel(
  text: string,
  weightsByWord: ReadonlyMap<string, number>,
  bias: number,
  trainVocab: Set<string>,
  threshold = 0.5,
  wordToIndex?: ReadonlyMap<string, number>,
): MessageInspection {
  const tokens = analyzeTokens(text, trainVocab, wordToIndex);
  const keptWords: string[] = [];
  const duplicateWords: string[] = [];
  const oovWords: string[] = [];
  const filteredTokens: string[] = [];

  for (const tok of tokens) {
    if (tok.status === "kept") keptWords.push(tok.text);
    else if (tok.status === "duplicate") duplicateWords.push(tok.text);
    else if (tok.status === "oov") oovWords.push(tok.text);
    else filteredTokens.push(tok.text);
  }

  let runningZ = bias;
  const terms: ScoreTerm[] = [
    {
      kind: "bias",
      word: "基准偏置 b",
      weight: bias,
      cumulativeZ: runningZ,
    },
  ];

  // Sort active word contributions by |weight| desc so decisive words lead the breakdown.
  const activeSorted = [...keptWords]
    .map((word) => ({ word, weight: weightsByWord.get(word) ?? 0 }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  for (const item of activeSorted) {
    runningZ += item.weight;
    terms.push({
      kind: "token",
      word: item.word,
      weight: item.weight,
      cumulativeZ: runningZ,
    });
  }

  const probability = stableSigmoid(runningZ);
  return {
    text,
    tokens,
    keptWords,
    duplicateWords,
    oovWords,
    filteredTokens,
    terms,
    bias,
    rawZ: runningZ,
    probability,
    pred: probability >= threshold ? 1 : 0,
  };
}
