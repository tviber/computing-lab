import { TRAIN_ROWS, VAL_ROWS } from "./corpusData.ts";
import { tokenizeWords } from "./tokenizer.ts";

export type CorpusMessage = {
  id: number;
  label: 0 | 1;
  text: string;
  tokens: string[];
};

function parseCorpusRows(rows: readonly string[]): CorpusMessage[] {
  const result: CorpusMessage[] = [];
  for (let i = 0; i < rows.length; i++) {
    const parts = rows[i].split("\t");
    const label = parts[0] === "1" ? 1 : 0;
    const text = parts[1] ?? "";
    const tokStr = parts[2] ?? "";
    const tokens = tokStr ? tokStr.split(" ").filter(Boolean) : tokenizeWords(text);
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
