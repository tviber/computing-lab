import { TRAIN_ROWS, VAL_ROWS } from "./corpusData.ts";

export type CorpusMessage = {
  id: number;
  label: 0 | 1;
  text: string;
  tokens: string[];
};

export function parseCorpusRows(rows: readonly string[]): CorpusMessage[] {
  const result: CorpusMessage[] = [];
  for (let i = 0; i < rows.length; i++) {
    const parts = rows[i].split("\t");
    const label = parts[0] === "1" ? 1 : 0;
    const text = parts[1] ?? "";
    const tokStr = parts[2] ?? "";
    const tokens = tokStr ? tokStr.split(" ").filter(Boolean) : [];
    result.push({ id: i, label, text, tokens });
  }
  return result;
}

export type PublicCorpus = {
  train: CorpusMessage[];
  val: CorpusMessage[];
  fullTrainVocab: Set<string>;
};

let cachedPublicCorpus: PublicCorpus | null = null;

/**
 * Lazily parses and caches the public train (1,400) and validation (300)
 * SMS splits plus the train-only vocabulary set.
 */
export function getPublicCorpus(): PublicCorpus {
  if (cachedPublicCorpus) return cachedPublicCorpus;
  const train = parseCorpusRows(TRAIN_ROWS);
  const val = parseCorpusRows(VAL_ROWS);
  const fullTrainVocab = new Set<string>();
  for (const msg of train) {
    for (const tok of msg.tokens) fullTrainVocab.add(tok);
  }
  cachedPublicCorpus = { train, val, fullTrainVocab };
  return cachedPublicCorpus;
}
