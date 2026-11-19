import type { RawTokenStatus } from "../domain/tokenizer.ts";

export const TOKEN_STATUS_LABELS: Record<RawTokenStatus, string> = {
  kept: "记为 1",
  duplicate: "重复了，不再计数",
  filtered: "标点，不计入",
  oov: "词表中没有",
};
