import { IMAGE_SAMPLING_STAGES } from "../../src/features/image-sampling/domain/stages.ts";
import type { SamplingJudgeResult } from "../../src/features/image-sampling/domain/protocol.ts";
import { sanitizeDraft, type StageDraft } from "../../src/features/image-sampling/lesson/state.ts";
import { judgeImageSubmission } from "../judge/image-sampling/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

export function imageSamplingRoutes() {
  return labRoutes<StageDraft, SamplingJudgeResult>({
    labId: "image-sampling",
    stageCount: IMAGE_SAMPLING_STAGES.length,
    saveDraft: (db, project, stageIndex, body, expectedRevision) =>
      saveStageDraft(db, project, stageIndex, sanitizeDraft(body.draft ?? {}), {
        expectedRevision,
      }),
    judge: (db, project, stageIndex, body, { staff }) =>
      judgeImageSubmission(
        db,
        project,
        stageIndex,
        { width: body.width, height: body.height },
        body.code,
        { bypassLock: staff },
      ),
  });
}
