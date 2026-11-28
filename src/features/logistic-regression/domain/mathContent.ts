/** These evaluator parts contain only authored text and validated numeric metrics. */
export function isMathJudgePart(id: string): boolean {
  return id === "prior" || id === "train-loss" || id === "val-loss";
}
