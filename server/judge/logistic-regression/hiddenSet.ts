import {
  parseCorpusRows,
  type CorpusMessage,
} from "../../../src/features/logistic-regression/domain/corpus.ts";
import { HIDDEN_TEST_ROWS } from "./hiddenCorpus.ts";

let cachedHiddenMessages: CorpusMessage[] | null = null;

export function getHiddenTestMessages(): CorpusMessage[] {
  if (!cachedHiddenMessages) {
    cachedHiddenMessages = parseCorpusRows(HIDDEN_TEST_ROWS);
  }
  return cachedHiddenMessages;
}
