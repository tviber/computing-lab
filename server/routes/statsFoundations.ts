import type {
  StatsFoundationsDraft,
  StatsFoundationsJudgeResult,
} from "../../src/features/stats-foundations/domain/protocol.ts";
import { STATS_FOUNDATIONS_STAGES } from "../../src/features/stats-foundations/domain/stages.ts";
import { sanitizeStatsFoundationsDraft } from "../../src/features/stats-foundations/domain/drafts.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { judgeStatsFoundationsSubmission } from "../judge/stats-foundations/judge.ts";
import { labRoutes } from "./labRoutes.ts";

export function statsFoundationsRoutes() {
  return labRoutes<StatsFoundationsDraft, StatsFoundationsJudgeResult>({
    labId: "stats-foundations",
    stageCount: STATS_FOUNDATIONS_STAGES.length,
    saveDraft: (
      db,
      project,
      stageIndex,
      body,
      expectedRevision,
      _expectedComponents,
      expectedGeneration,
    ) =>
      saveStageDraft(
        db,
        project,
        stageIndex,
        sanitizeStatsFoundationsDraft(stageIndex, body.draft ?? {}),
        {
          expectedRevision,
          expectedGeneration,
        },
      ),
    judge: (db, project, stageIndex, body, { staff }) =>
      judgeStatsFoundationsSubmission(db, project, stageIndex, body.draft, { bypassLock: staff }),
  });
}
