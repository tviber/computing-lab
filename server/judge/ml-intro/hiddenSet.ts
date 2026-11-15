import {
  parseCorpusRows,
  type CorpusMessage,
} from "../../../src/features/ml-intro/domain/corpus.ts";
import { HIDDEN_TEST_ROWS } from "./hiddenCorpus.ts";

let cachedHiddenMessages: CorpusMessage[] | null = null;

/** Held-out 300 real SMS messages kept strictly inside server/judge/ml-intro. */
export function getHiddenTestMessages(): CorpusMessage[] {
  if (!cachedHiddenMessages) {
    cachedHiddenMessages = parseCorpusRows(HIDDEN_TEST_ROWS);
  }
  return cachedHiddenMessages;
}
