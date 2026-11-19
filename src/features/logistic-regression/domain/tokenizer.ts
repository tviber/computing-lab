import { CN_LEXICON } from "./cnLexicon.ts";

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

const CJK_RE = /[\u4e00-\u9fff]/;
const ASCII_WORD_RE = /^[a-zA-Z0-9]+/;
const SPACE_RE = /^\s+/;

const LEXICON_SET = new Set<string>(CN_LEXICON);
const MAX_LEXICON_LEN = CN_LEXICON.reduce((m, w) => (w.length > m ? w.length : m), 1);

function stableSigmoid(z: number): number {
  if (z >= 35) return 1;
  if (z <= -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

function segmentPiecewise(text: string): { raw: string; isWord: boolean }[] {
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
      const upper = Math.min(MAX_LEXICON_LEN, text.length - i);
      for (let len = upper; len >= 2; len--) {
        const cand = text.slice(i, i + len);
        if (LEXICON_SET.has(cand)) {
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

export function tokenizeWords(text: string): string[] {
  const segments = segmentPiecewise(text.trim());
  const words: string[] = [];
  for (const seg of segments) {
    if (seg.isWord) words.push(seg.raw);
  }
  return words;
}

function tagSegments(
  segments: readonly { raw: string; isWord: boolean }[],
  trainVocab: ReadonlySet<string>,
  wordToIndex?: ReadonlyMap<string, number>,
): TokenItem[] {
  const seenInMessage = new Set<string>();
  const tokens: TokenItem[] = [];

  for (const seg of segments) {
    if (!seg.isWord) {
      tokens.push({
        text: seg.raw,
        status: "filtered",
        vocabIndex: null,
        note: "程序会忽略这个标点或符号。",
      });
      continue;
    }
    if (!trainVocab.has(seg.raw)) {
      tokens.push({
        text: seg.raw,
        status: "oov",
        vocabIndex: null,
        note: "训练词表里没有这个词，所以这个词不参与计算。",
      });
      continue;
    }
    const idx = wordToIndex?.get(seg.raw) ?? null;
    if (seenInMessage.has(seg.raw)) {
      tokens.push({
        text: seg.raw,
        status: "duplicate",
        vocabIndex: idx,
        note: "这个词在本条短信中已经出现过，对应位置仍记为 1，不会累加。",
      });
      continue;
    }
    seenInMessage.add(seg.raw);
    tokens.push({
      text: seg.raw,
      status: "kept",
      vocabIndex: idx,
      note: "这个词在词表中，也是它在本条短信中第一次出现。程序把对应位置记为 1。",
    });
  }

  return tokens;
}

export function analyzeTokens(
  text: string,
  trainVocab: ReadonlySet<string>,
  wordToIndex?: ReadonlyMap<string, number>,
): TokenItem[] {
  return tagSegments(segmentPiecewise(text.trim()), trainVocab, wordToIndex);
}

function buildInspectionFromTokens(
  text: string,
  tokens: TokenItem[],
  weightsByWord: ReadonlyMap<string, number>,
  bias: number,
  threshold: number,
): MessageInspection {
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

export function inspectMessageWithModel(
  text: string,
  weightsByWord: ReadonlyMap<string, number>,
  bias: number,
  trainVocab: ReadonlySet<string>,
  threshold = 0.5,
  wordToIndex?: ReadonlyMap<string, number>,
): MessageInspection {
  const tokens = analyzeTokens(text, trainVocab, wordToIndex);
  return buildInspectionFromTokens(text, tokens, weightsByWord, bias, threshold);
}

function arrayEquals(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function inspectCorpusMessageWithModel(
  msg: { text: string; tokens: readonly string[] },
  weightsByWord: ReadonlyMap<string, number>,
  bias: number,
  trainVocab: ReadonlySet<string>,
  threshold = 0.5,
  wordToIndex?: ReadonlyMap<string, number>,
): MessageInspection {
  const textTokens = analyzeTokens(msg.text, trainVocab, wordToIndex);
  const textWords = textTokens.filter((t) => t.status !== "filtered").map((t) => t.text);
  const tokens = arrayEquals(textWords, msg.tokens)
    ? textTokens
    : tagSegments(
        msg.tokens.map((w) => ({ raw: w, isWord: true })),
        trainVocab,
        wordToIndex,
      );
  return buildInspectionFromTokens(msg.text, tokens, weightsByWord, bias, threshold);
}
