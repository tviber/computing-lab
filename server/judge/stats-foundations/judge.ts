import type { DatabaseSync } from "node:sqlite";
import { sanitizeStatsFoundationsDraft } from "../../../src/features/stats-foundations/domain/drafts.ts";
import type {
  StatsFoundationsDraft,
  StatsFoundationsJudgeResult,
} from "../../../src/features/stats-foundations/domain/protocol.ts";
import {
  getStatsFoundationsStage,
  nextStatsFoundationsStage,
  statsFoundationsStageUnlocked,
} from "../../../src/features/stats-foundations/domain/stages.ts";
import { evaluateStatsStage } from "../../../src/features/stats-foundations/lesson/judge.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";

export function judgeStatsFoundationsSubmission(
  db: DatabaseSync,
  project: ProjectRow<StatsFoundationsDraft>,
  stageIndex: number,
  rawDraft: unknown,
  options?: { bypassLock?: boolean },
): StatsFoundationsJudgeResult | LabJudgeError {
  const gated = gateStage(
    getStatsFoundationsStage(stageIndex),
    (stage) => statsFoundationsStageUnlocked(stage.index, project.passedStages),
    options,
  );
  if ("error" in gated) return gated;

  const draft = sanitizeStatsFoundationsDraft(stageIndex, rawDraft);
  const { passed, feedback, summary } = evaluateStatsStage(stageIndex, draft);
  const nextStage = nextStatsFoundationsStage(stageIndex);

  const passedStages = withTransaction(db, () => {
    insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: "stats-foundations",
      stageIndex,
      snapshot: draft,
      passed,
      score: passed ? 1 : 0,
      total: 1,
      testSummary: {
        ...summary,
        parts: [
          {
            id: gated.stage.slug,
            label: gated.stage.title,
            ok: passed,
            detail: `${feedback}（${summary.detail}）`,
          },
        ],
      },
    });
    if (passed) {
      return advanceStage(db, project, stageIndex, () =>
        Math.max(project.currentStage, nextStage ?? stageIndex),
      ).passedStages;
    }
    return project.passedStages;
  });

  return {
    passed,
    stageIndex,
    nextStage,
    passedStages,
    summary,
    feedback,
  };
}
