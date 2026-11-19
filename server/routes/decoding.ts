import type {
  DecodingDraft,
  DecodingJudgeResult,
} from "../../src/features/decoding/domain/protocol.ts";
import { generatePayload } from "../../src/features/decoding/domain/payload.ts";
import { seedFor } from "../../src/features/decoding/domain/rng.ts";
import { DECODING_STAGES } from "../../src/features/decoding/domain/stages.ts";
import { sanitizeDraft } from "../../src/features/decoding/lesson/state.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { judgeDecodingSubmission } from "../judge/decoding/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

export function decodingRoutes() {
  // 12 submissions per stage per 10 minutes — every payload is per-user
  // seeded anyway, but answer pools are enumerable, so guessing should stay
  // slower than decoding.
  const judgeLimiter = new SlidingWindowLimiter(12, 10 * 60 * 1000);
  return labRoutes<DecodingDraft, DecodingJudgeResult>({
    labId: "decoding",
    stageCount: DECODING_STAGES.length,
    // Every stage's data is derived from the student's id, so the bytes a
    // student sees are theirs alone — and the judge can rebuild them exactly.
    projectExtras: (_db, project) => ({
      payloads: Object.fromEntries(
        DECODING_STAGES.map((stage) => [
          stage.index,
          generatePayload(stage, seedFor(project.userId, "decoding", stage.index)).payload,
        ]),
      ),
    }),
    saveDraft: (
      db,
      project,
      stageIndex,
      body,
      expectedRevision,
      _expectedComponents,
      expectedGeneration,
    ) =>
      saveStageDraft(db, project, stageIndex, sanitizeDraft(body.draft ?? {}), {
        expectedRevision,
        expectedGeneration,
      }),
    judge: (db, project, stageIndex, body, { staff }) => {
      const key = `${project.userId}|decoding|${stageIndex}`;
      if (judgeLimiter.exceeded(key)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(key);
      const rawAnswers = body.conceptAnswers;
      const stage = DECODING_STAGES.find((s) => s.index === stageIndex);
      const validPromptIds = new Set(stage?.prompts?.map((p) => p.id) ?? []);
      const conceptAnswers: Record<string, number> = {};
      if (rawAnswers && typeof rawAnswers === "object") {
        // Whitelist to this stage's prompt ids — bounded size by construction.
        for (const [key, value] of Object.entries(rawAnswers as Record<string, unknown>)) {
          if (
            validPromptIds.has(key) &&
            typeof value === "number" &&
            Number.isInteger(value) &&
            value >= 0
          ) {
            conceptAnswers[key] = value;
          }
        }
      }
      return judgeDecodingSubmission(
        db,
        project,
        stageIndex,
        {
          artifact: body.artifact,
          code: body.code,
          conceptAnswers,
        },
        { bypassLock: staff },
      );
    },
  });
}
